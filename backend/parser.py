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
    """Convert a solfa syllable to a MIDI note number"""
    if note not in SOLFA_DEGREES:
        return None
    root = KEY_ROOTS.get(key, 60)
    midi_note = root + SOLFA_DEGREES[note] + (octave * 12)
    return midi_note

# Test it
if __name__ == '__main__':
    test_notes = ['d', 'r', 'm', 'f', 's', 'l', 't']
    print("Testing solfa to MIDI conversion in C Major:")
    for note in test_notes:
        midi = solfa_to_midi(note, 'C_MAJOR')
        print(f"  {note} -> MIDI {midi}")
    
    print("\nTesting in F Major:")
    for note in test_notes:
        midi = solfa_to_midi(note, 'F_MAJOR')
        print(f"  {note} -> MIDI {midi}")