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


def voice_to_midi_track(notes, channel, ticks_per_beat=TICKS_PER_BEAT):
    """
    Convert a list of (midi_note, duration_beats) tuples into a MidiTrack.
    None = rest. Duration can be 0.25, 0.5, 0.75, 1, 2, 3, 4 beats etc.
    """
    track = MidiTrack()

    for item in notes:
        note, duration = item
        duration_ticks = int(duration * ticks_per_beat)

        if note is None:
            track.append(Message('note_off', note=0, velocity=0,
                                  time=duration_ticks, channel=channel))
        else:
            track.append(Message('note_on', note=int(note), velocity=80,
                                  time=0, channel=channel))
            track.append(Message('note_off', note=int(note), velocity=80,
                                  time=duration_ticks, channel=channel))
    # Add short silence at end so FluidSynth renders cleanly
    track.append(Message('note_off', note=0, velocity=0,
                          time=ticks_per_beat * 2, channel=channel))        

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
SOPRANO: l:s:l.s:f | m:t:s:l |
ALTO: m:m:r:r | m:m:d:d |
TENOR: s:f:m:r | d:t1:d:m |
BASS: d:-:-:- | d:-:-:- |
"""
    generate_midi_file(sample_score, output_path='test_output.mid')