# Solfa to MIDI note mapper
SOLFA_DEGREES = {
    'd': 0, 'r': 2, 'm': 4, 'f': 5,
    's': 7, 'l': 9, 't': 11
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


def get_octave(token):
    """Extract octave shift and clean token."""
    if token.endswith("'"):
        return token[:-1], 1
    elif token and token[-1].isdigit():
        return token[:-1], -1
    return token, 0


def parse_beat_token(token, key, last_midi):
    """
    Parse one beat token. Rules:
    - dot/comma BEFORE a note = rest prefix + note takes remaining
    - dot/comma AFTER a note = note takes that duration + rest for remaining
    - dot BETWEEN two notes = split beat equally between them
    - '-' = hold previous note for 1 full beat
    - empty = rest for 1 full beat
    """
    token = token.strip()

    if not token:
        return [(None, 1.0)]

    if token == '-':
        return [(last_midi, 1.0)]

    results = []
    i = 0
    total = 0.0

    while i < len(token):
        char = token[i]

        # Leading rest prefix
        if char == '.' and (i == 0 or token[i-1] not in 'drmfslt'):
            # Check if dot is between two notes (e.g. l.l)
            # If next char is a note, it's a separator = equal split
            if i > 0 and token[i-1].lower() in SOLFA_DEGREES:
                # dot is after a note — check if there's another note after
                if i + 1 < len(token) and token[i+1].lower() in SOLFA_DEGREES:
                    # dot between two notes: previous note already added at 0.5
                    # update last result duration to 0.5
                    if results:
                        midi, _ = results[-1]
                        results[-1] = (midi, 0.5)
                        total = sum(d for _, d in results)
                    i += 1
                    continue
                else:
                    # trailing dot after note = note was 0.5, add rest
                    if results:
                        midi, _ = results[-1]
                        results[-1] = (midi, 0.5)
                        total = sum(d for _, d in results)
                    results.append((None, 0.5))
                    total += 0.5
                    i += 1
                    continue
            else:
                # leading dot = rest 0.5
                results.append((None, 0.5))
                total += 0.5
                i += 1
                continue

        elif char == ',' and (i == 0 or token[i-1] not in 'drmfslt'):
            if i > 0 and token[i-1].lower() in SOLFA_DEGREES:
                # comma after note
                if results:
                    midi, _ = results[-1]
                    results[-1] = (midi, 0.25)
                    total = sum(d for _, d in results)
                results.append((None, 0.75))
                total += 0.75
                i += 1
                continue
            else:
                # leading comma = rest 0.25
                results.append((None, 0.25))
                total += 0.25
                i += 1
                continue

        # Note character
        if char.lower() in SOLFA_DEGREES:
            syllable = char.lower()
            i += 1

            # Octave
            octave = 0
            if i < len(token) and token[i] == "'":
                octave = 1
                i += 1
            elif i < len(token) and token[i].isdigit():
                octave = -1
                i += 1

            # Peek at suffix
            suffix = ''
            if i < len(token) and token[i:i+2] == '.,':
                suffix = '.,'
            elif i < len(token) and token[i] == '.':
                # Check if dot is between two notes
                if i + 1 < len(token) and token[i+1].lower() in SOLFA_DEGREES:
                    suffix = '.between'
                else:
                    suffix = '.'
            elif i < len(token) and token[i] == ',':
                suffix = ','

            midi = solfa_to_midi(syllable, key, octave)

            if suffix == '.,':
                duration = 0.75
                i += 2
            elif suffix == '.between':
                duration = 0.5
                i += 1  # consume the dot, next iteration handles next note
            elif suffix == '.':
                duration = 0.5
                i += 1
            elif suffix == ',':
                duration = 0.25
                i += 1
            else:
                # No suffix — take remaining beats
                remaining = round(1.0 - total, 4)
                duration = remaining if remaining > 0 else 1.0

            results.append((midi, duration))
            total += duration
            continue

        i += 1

    # Pad with rest if total < 1.0
    remaining = round(1.0 - total, 4)
    if remaining > 0.001:
        results.append((None, remaining))

    return results

def parse_voice_line(line, key='C_MAJOR'):
    """
    Parse one voice line and return list of (midi, duration) tuples.
    Colon alone = rest. Bar lines | are ignored as separators.
    Tied notes: - continues previous note across bar lines.
    """
    # Split by bar lines first, then by colons
    bars = [b for b in line.strip().split('|') if b.strip()]

    all_tokens = []
    for bar in bars:
        tokens = bar.split(':')
        for token in tokens:
            all_tokens.append(token.strip())

    result = []
    last_midi = None

    for token in all_tokens:
        notes = parse_beat_token(token, key, last_midi)
        for midi, duration in notes:
            result.append((midi, duration))
            if midi is not None:
                last_midi = midi

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
    print("=== Test 1: Basic notes F Major ===")
    for note in ['d', 'r', 'm', 'f', 's', 'l', 't']:
        print(f"  {note} -> MIDI {solfa_to_midi(note, 'F_MAJOR')}")

    print("\n=== Test 2: d:r:m:f | s:s:m:d ===")
    from pprint import pprint
    pprint(parse_voice_line('d:r:m:f | s:s:m:d |', 'F_MAJOR'))

    print("\n=== Test 3: l.l (two half beat notes) ===")
    pprint(parse_voice_line('l.l:s:m:d |', 'F_MAJOR'))

    print("\n=== Test 4: .d (rest half + d half) ===")
    pprint(parse_voice_line('.d:d:r:m |', 'F_MAJOR'))

    print("\n=== Test 5: d, (quarter beat) ===")
    pprint(parse_voice_line('d,d,d,d,:r:m:f |', 'F_MAJOR'))

    print("\n=== Test 6: tied notes across bar line ===")
    pprint(parse_voice_line('d:r:m:- | -:f:s:l |', 'F_MAJOR'))

    print("\n=== Test 7: standalone colon rest ===")
    pprint(parse_voice_line(':d:r:m |', 'F_MAJOR'))

    print("\n=== Test 8: real soprano line ===")
    pprint(parse_voice_line('l:s:l.l:f | m:t:s:l |', 'F_MAJOR'))