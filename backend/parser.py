# Solfa to MIDI note mapper
# Maps solfa syllables to scale degrees
SOLFA_DEGREES = {
    'd': 0,  # Do
    'r': 2,  # Re
    'm': 4,  # Mi
    'f': 5,  # Fa
    's': 7,  # Sol
    'l': 9,  # La
    't': 11  # Ti
}

# Maps key names to their root MIDI note numbers
KEY_ROOTS = {
    'C_MAJOR': 60,
    'D_MAJOR': 62,
    'E_MAJOR': 64,
    'F_MAJOR': 65,
    'G_MAJOR': 67,
    'A_MAJOR': 69,
    'B_MAJOR': 71,
    'Bb_MAJOR': 70,
    'Eb_MAJOR': 63,
    'Ab_MAJOR': 68,
}


def solfa_to_midi(note, key='C_MAJOR', octave=0):
    """Convert a single solfa syllable to a MIDI note number"""
    if note not in SOLFA_DEGREES:
        return None
    root = KEY_ROOTS.get(key, 60)
    midi_note = root + SOLFA_DEGREES[note] + (octave * 12)
    return midi_note


def parse_note_token(token):
    """
    Parse a single note token like 'd', 'd1' (lower octave), "d'" (upper octave),
    '-' (held note), or 'x' (rest).
    Returns a tuple: (syllable_or_special, octave_shift)
    """
    token = token.strip()

    if token == '-':
        return ('HOLD', 0)
    if token in ('x', 'X'):
        return ('REST', 0)

    octave_shift = 0
    # Trailing apostrophe = upper octave
    if token.endswith("'"):
        octave_shift = 1
        token = token[:-1]
    # Trailing digit = lower octave (e.g. d1, s1)
    elif token and token[-1].isdigit():
        octave_shift = -1
        token = token[:-1]

    syllable = token.lower()
    if syllable not in SOLFA_DEGREES:
        return (None, 0)

    return (syllable, octave_shift)


def parse_voice_line(line, key='C_MAJOR'):
    """
    Parse one voice line such as: d:r:m:f | s:s:m:d |
    Returns a list of bars, each bar a list of MIDI note numbers
    (or None for rest, or 'HOLD' marker for tie/extend).
    """
    line = line.strip()
    bars = [b.strip() for b in line.split('|') if b.strip()]

    parsed_bars = []
    last_midi = None

    for bar in bars:
        beats = [t.strip() for t in bar.split(':') if t.strip()]
        parsed_beats = []

        for token in beats:
            syllable, octave_shift = parse_note_token(token)

            if syllable == 'HOLD':
                parsed_beats.append(last_midi)  # extend previous note
            elif syllable == 'REST':
                parsed_beats.append(None)
                last_midi = None
            elif syllable is None:
                parsed_beats.append(None)  # unrecognized token treated as rest
            else:
                midi = solfa_to_midi(syllable, key, octave_shift)
                parsed_beats.append(midi)
                last_midi = midi

        parsed_bars.append(parsed_beats)

    return parsed_bars


def parse_score(score_text):
    """
    Parse a full score block like:

        KEY: F_MAJOR
        TIME: 4/4
        TEMPO: 90
        SOPRANO: d:r:m:f | s:s:m:d |
        ALTO: m:m:r:r | m:m:d:d |
        TENOR: s:f:m:r | d:t1:d:m |
        BASS: d:d:d:d | d:d:d:d |

    Returns a dict with key, time, tempo, and parsed MIDI data for each voice part.
    """
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


# Test it
if __name__ == '__main__':
    print("=== Test 1: Single syllable conversion ===")
    test_notes = ['d', 'r', 'm', 'f', 's', 'l', 't']
    print("C Major:")
    for note in test_notes:
        print(f"  {note} -> MIDI {solfa_to_midi(note, 'C_MAJOR')}")

    print("\nF Major:")
    for note in test_notes:
        print(f"  {note} -> MIDI {solfa_to_midi(note, 'F_MAJOR')}")

    print("\n=== Test 2: Full voice line parsing ===")
    soprano_line = "d:r:m:f | s:s:m:d |"
    result = parse_voice_line(soprano_line, key='F_MAJOR')
    print(f"Input:  {soprano_line}")
    print(f"Output: {result}")

    print("\n=== Test 3: Full score parsing ===")
    sample_score = """
KEY: F_MAJOR
TIME: 4/4
TEMPO: 90
SOPRANO: d:r:m:f | s:s:m:d |
ALTO: m:m:r:r | m:m:d:d |
TENOR: s:f:m:r | d:t1:d:m |
BASS: d:d:d:d | d:d:d:d |
"""
    score = parse_score(sample_score)
    print(f"Key: {score['key']}")
    print(f"Time Signature: {score['time_signature']}")
    print(f"Tempo: {score['tempo']} BPM")
    for voice, bars in score['voices'].items():
        print(f"{voice}: {bars}")