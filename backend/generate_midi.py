import mido
from mido import Message, MidiFile, MidiTrack, MetaMessage
from parser import parse_score

# MIDI channel assignments — one channel per voice part
VOICE_CHANNELS = {
    'SOPRANO': 0,
    'ALTO': 1,
    'TENOR': 2,
    'BASS': 3,
}

TICKS_PER_BEAT = 480  # standard MIDI resolution


def tempo_to_microseconds(bpm):
    """Convert beats-per-minute to MIDI tempo (microseconds per quarter note)"""
    return int(60_000_000 / bpm)


def voice_to_midi_track(bars, channel, ticks_per_beat=TICKS_PER_BEAT):
    """
    Convert one voice's parsed bars (list of bars, each a list of MIDI notes)
    into a MidiTrack. Each beat = one quarter note (ticks_per_beat ticks).
    None = rest. Repeated identical values from a HOLD are treated as a
    single longer note.
    """
    track = MidiTrack()

    # Flatten all bars into one continuous list of beats
    all_beats = []
    for bar in bars:
        all_beats.extend(bar)

    i = 0
    while i < len(all_beats):
        note = all_beats[i]

        # Count how many consecutive beats this note is held for
        duration_beats = 1
        while (i + duration_beats < len(all_beats)
               and all_beats[i + duration_beats] == note
               and note is not None):
            duration_beats += 1

        duration_ticks = duration_beats * ticks_per_beat

        if note is None:
            # Rest: just advance time, no note_on/note_off
            track.append(Message('note_off', note=0, velocity=0,
                                  time=duration_ticks, channel=channel))
        else:
            track.append(Message('note_on', note=note, velocity=80,
                                  time=0, channel=channel))
            track.append(Message('note_off', note=note, velocity=80,
                                  time=duration_ticks, channel=channel))

        i += duration_beats

    return track


def generate_midi_file(score_text, output_path='output.mid'):
    """
    Parse solfa score text and write a complete SATB MIDI file to output_path.
    """
    score = parse_score(score_text)

    midi_file = MidiFile(ticks_per_beat=TICKS_PER_BEAT)

    # Tempo track (track 0)
    tempo_track = MidiTrack()
    midi_file.tracks.append(tempo_track)
    tempo_track.append(MetaMessage('set_tempo',
                                    tempo=tempo_to_microseconds(score['tempo']),
                                    time=0))
    tempo_track.append(MetaMessage('track_name', name='Tempo Track', time=0))

    # One track per voice part
    for voice_name, bars in score['voices'].items():
        channel = VOICE_CHANNELS.get(voice_name, 0)
        track = voice_to_midi_track(bars, channel)
        track.insert(0, MetaMessage('track_name', name=voice_name, time=0))
        # Choir Aahs patch (General MIDI program 52, zero-indexed = 52)
        track.insert(1, Message('program_change', program=52,
                                 channel=channel, time=0))
        midi_file.tracks.append(track)

    midi_file.save(output_path)
    print(f"MIDI file saved to: {output_path}")
    print(f"Key: {score['key']} | Time: {score['time_signature']} | Tempo: {score['tempo']} BPM")
    print(f"Voices written: {list(score['voices'].keys())}")
    return output_path


if __name__ == '__main__':
    sample_score = """
KEY: F_MAJOR
TIME: 4/4
TEMPO: 90
SOPRANO: d:r:m:f | s:s:m:d |
ALTO: m:m:r:r | m:m:d:d |
TENOR: s:f:m:r | d:t1:d:m |
BASS: d:d:d:d | d:d:d:d |
"""
    generate_midi_file(sample_score, output_path='test_output.mid')