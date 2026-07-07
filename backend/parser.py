# Solfa to MIDI note mapper
SOLFA_DEGREES = {
    # Standard
    'd': 0, 'r': 2, 'm': 4, 'f': 5, 's': 7, 'l': 9, 't': 11,
    # Chromatic ascending
    'di': 1, 'ri': 3, 'fi': 6, 'si': 8, 'li': 10,
    # Chromatic descending
    'ra': 1, 'me': 3, 'se': 6, 'le': 8, 'te': 10,
}

KEY_ROOTS = {
    'C_MAJOR': 60, 'D_MAJOR': 62, 'E_MAJOR': 64,
    'F_MAJOR': 65, 'G_MAJOR': 67, 'A_MAJOR': 69,
    'B_MAJOR': 71, 'Bb_MAJOR': 70, 'Eb_MAJOR': 63,
    'Ab_MAJOR': 68,
}


def solfa_to_midi(syllable, key='C_MAJOR', octave=0):
    if syllable not in SOLFA_DEGREES:
        return None
    root = KEY_ROOTS.get(key, 60)
    return root + SOLFA_DEGREES[syllable] + (octave * 12)


def get_duration_value(suffix):
    """Convert a duration suffix to beat value."""
    if suffix in ('', ':'): return 1.0
    if suffix == "''": return 0.333
    if suffix == '.,': return 0.75
    if suffix == '.': return 0.5
    if suffix == ',': return 0.25
    return 1.0


def extract_suffix(s, i):
    if i >= len(s):
        return '', 0
    if s[i:i+2] == "''":
        return "''", 2
    if s[i:i+2] == '.,':
        return '.,', 2
    if s[i] == ',':
        return ',', 1
    if s[i] == '.':
        next_i = i + 1
        if next_i < len(s) and (s[next_i].isalpha() or s[next_i] in ('-', 'x')):
            return '', 0
        return '.', 1
    return '', 0


def peek_next_note(s, i):
    if i >= len(s):
        return False
    if s[i] == '.' and i + 1 < len(s):
        next_char = s[i + 1].lower()
        if next_char.isalpha() or next_char in ('-', 'x'):
            return True
    return False


def parse_beat_group(beat_str, key):
    beat_str = beat_str.strip()
    if not beat_str:
        return [], 0.0

    results = []
    total = 0.0
    i = 0

    def duration_for_plain_note(current_index):
        remaining_str = beat_str[current_index:].strip()
        has_more = bool(remaining_str) and (
            remaining_str[0].isalpha() or remaining_str[0] in ('-', 'x')
        )
        if has_more:
            return round(1.0 - total, 4)
        if total > 0:
            return round(1.0 - total, 4)
        return 1.0

    while i < len(beat_str):

        if beat_str[i] == '-':
            i += 1
            suffix, consumed = extract_suffix(beat_str, i)
            i += consumed
            if suffix:
                dur = get_duration_value(suffix)
            elif peek_next_note(beat_str, i):
                dur = 0.5
            else:
                dur = duration_for_plain_note(i)
            if peek_next_note(beat_str, i):
                i += 1
            results.append(('HOLD', round(dur, 4)))
            total = round(total + dur, 4)
            continue

        if beat_str[i] == 'x':
            i += 1
            suffix, consumed = extract_suffix(beat_str, i)
            i += consumed
            if suffix:
                dur = get_duration_value(suffix)
            elif peek_next_note(beat_str, i):
                dur = 0.5
            else:
                dur = duration_for_plain_note(i)
            if peek_next_note(beat_str, i):
                i += 1
            results.append(('REST', round(dur, 4)))
            total = round(total + dur, 4)
            continue

        if beat_str[i].isalpha():
            syllable = None
            if i + 1 < len(beat_str) and beat_str[i + 1].isalpha():
                two = beat_str[i:i + 2].lower()
                if two in SOLFA_DEGREES:
                    syllable = two
                    i += 2
            if syllable is None:
                one = beat_str[i].lower()
                if one in SOLFA_DEGREES:
                    syllable = one
                    i += 1
                else:
                    i += 1
                    continue

            octave = 0
            if i < len(beat_str) and beat_str[i] == "'":
                octave = 1
                i += 1
            elif i < len(beat_str) and beat_str[i].isdigit():
                octave = -1
                i += 1

            suffix, consumed = extract_suffix(beat_str, i)
            i += consumed

            if suffix:
                dur = get_duration_value(suffix)
            elif peek_next_note(beat_str, i):
                dur = 0.5
            else:
                dur = duration_for_plain_note(i)

            if peek_next_note(beat_str, i):
                i += 1

            midi = solfa_to_midi(syllable, key, octave)
            results.append((midi, round(dur, 4)))
            total = round(total + dur, 4)
            continue

        i += 1

    return results, round(total, 4)

def parse_voice_line(line, key='C_MAJOR'):
    """
    Parse one voice line and return list of (midi_or_special, duration) tuples.

    Both ':' and '/' act as beat separators.
    Bar lines '|' are ignored.

    Examples:
        'd:r:m:f |'           -> 4 full beats
        'd.m:r:m:f |'         -> (d0.5+m0.5), r, m, f
        'd.,m,:r:m:f |'       -> (d0.75+m0.25), r, m, f
        'd.r/m:m: |'          -> (d0.5+r0.5), m, m
        'd,m,m,m,:r:m:f |'    -> (4 quarter notes), r, m, f
    """
    # Remove bar lines
    line = line.replace('|', ' ').strip()

    result = []
    current_beat = ''
    i = 0

    while i < len(line):
        char = line[i]

        if char == ':' or char == '/':
            # Beat separator — process accumulated beat group
            if current_beat.strip():
                notes, _ = parse_beat_group(current_beat.strip(), key)
                result.extend(notes)
            current_beat = ''
        elif char == ' ':
            # Space (around bar lines) — treat like beat separator
            # but only if we have accumulated content
            if current_beat.strip():
                notes, _ = parse_beat_group(current_beat.strip(), key)
                result.extend(notes)
                current_beat = ''
        else:
            current_beat += char

        i += 1

    # Handle remaining content (line didn't end with separator)
    if current_beat.strip():
        notes, _ = parse_beat_group(current_beat.strip(), key)
        result.extend(notes)

    return result


def parse_score(score_text):
    key = 'C_MAJOR'
    time_sig = '4/4'
    tempo = 90
    voices = {}

    for raw_line in score_text.strip().splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.upper().startswith('KEY:'):
            key = line.split(':', 1)[1].strip()
        elif line.upper().startswith('TIME:'):
            time_sig = line.split(':', 1)[1].strip()
        elif line.upper().startswith('TEMPO:'):
            tempo = int(line.split(':', 1)[1].strip())
        else:
            for part_name in ('SOPRANO', 'ALTO', 'TENOR', 'BASS'):
                prefix = part_name + ':'
                if line.upper().startswith(prefix):
                    notation = line[len(prefix):].strip()
                    voices[part_name] = parse_voice_line(notation, key)

    return {
        'key': key,
        'time_signature': time_sig,
        'tempo': tempo,
        'voices': voices,
    }


if __name__ == '__main__':
    from pprint import pprint

    print("=== Test 1: Basic notes F Major ===")
    for note in ['d', 'r', 'm', 'f', 's', 'l', 't']:
        print(f"  {note} -> MIDI {solfa_to_midi(note, 'F_MAJOR')}")

    print("\n=== Test 2: Standard bar d:r:m:f ===")
    pprint(parse_voice_line('d:r:m:f |', 'F_MAJOR'))

    print("\n=== Test 3: Shared beat d.m:r:m:f ===")
    pprint(parse_voice_line('d.m:r:m:f |', 'F_MAJOR'))

    print("\n=== Test 4: Unequal shared beat d.,m,:r:m:f ===")
    pprint(parse_voice_line('d.,m,:r:m:f |', 'F_MAJOR'))

    print("\n=== Test 5: Four quarter notes d,m,m,m,:r:m:f ===")
    pprint(parse_voice_line('d,m,m,m,:r:m:f |', 'F_MAJOR'))

    print("\n=== Test 6: Mixed separators d.r/m:m ===")
    pprint(parse_voice_line('d.r/m:m |', 'F_MAJOR'))

    print("\n=== Test 7: Hold and rest with duration ===")
    pprint(parse_voice_line('-.:x,:d:r |', 'F_MAJOR'))

    print("\n=== Test 8: Chromatic notes ===")
    pprint(parse_voice_line('di:ri:fi:si |', 'F_MAJOR'))

    print("\n=== Test 9: Real soprano line ===")
    pprint(parse_voice_line('l:s:l.l:f | m:t:s:l |', 'F_MAJOR'))

    print("\n=== Test 10: Full score ===")
    sample = """
KEY: F_MAJOR
TIME: 4/4
TEMPO: 90
SOPRANO: d.m:r:m:f | s:s:m:d |
ALTO: m:m:r:r | m:m:d:d |
TENOR: s:f:m:r | d:t1:d:m |
BASS: d:-:-:- | d:-:-:- |
"""
    pprint(parse_score(sample))