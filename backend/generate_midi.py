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

# General MIDI program numbers for each voice
VOICE_PROGRAMS = {
    'SOPRANO': 52,
    'ALTO': 52,
    'TENOR': 52,
    'BASS': 52,
}

VOICE_OCTAVE_SHIFT = {
    'SOPRANO': 0,
    'ALTO': 0,
    'TENOR': 0,
    'BASS': -1,
}
TICKS_PER_BEAT = 480


def tempo_to_microseconds(bpm):
    return int(60_000_000 / bpm)


def voice_to_midi_track(notes, channel, ticks_per_beat=TICKS_PER_BEAT, voice_name=None):
    """
    Convert a list of (midi_note_or_special, duration_beats) tuples into a MidiTrack.
    'HOLD' extends the currently sounding note (no retrigger).
    'REST' is silence.
    """
    track = MidiTrack()
    octave_shift = VOICE_OCTAVE_SHIFT.get(voice_name, 0) if voice_name else 0

    pending_note = None
    pending_ticks = 0

    for item in notes:
        note, duration = item
        duration_ticks = int(duration * ticks_per_beat)

        if note == 'HOLD':
            if pending_note is not None:
                # extend the currently sounding note, no retrigger
                pending_ticks += duration_ticks
            else:
                # nothing to hold, just silent gap
                track.append(Message('note_off', note=0, velocity=0,
                                      time=duration_ticks, channel=channel))
            continue

        if note == 'REST' or note is None:
            if pending_note is not None:
                track.append(Message('note_off', note=pending_note, velocity=0,
                                      time=pending_ticks, channel=channel))
                pending_note = None
                pending_ticks = 0
            track.append(Message('note_off', note=0, velocity=0,
                                  time=duration_ticks, channel=channel))
            continue

        # Regular note: close out whatever was sustaining, then start this one
        if pending_note is not None:
            track.append(Message('note_off', note=pending_note, velocity=0,
                                  time=pending_ticks, channel=channel))
            pending_note = None
            pending_ticks = 0

        shifted_note = int(note) + (octave_shift * 12)
        shifted_note = max(0, min(127, shifted_note))

        track.append(Message('note_on', note=shifted_note, velocity=95,
                              time=0, channel=channel))
        pending_note = shifted_note
        pending_ticks = duration_ticks

    # Flush any note still sustaining at the end
    if pending_note is not None:
        track.append(Message('note_off', note=pending_note, velocity=0,
                              time=pending_ticks, channel=channel))

    # Trailing silence so FluidSynth renders cleanly
    track.append(Message('note_off', note=0, velocity=0,
                          time=200, channel=channel))

    return track

def generate_midi_file(score_text, output_path='output.mid', voice_filter='all', voice_volumes=None):
    """
    Parse solfa score text and write a complete SATB MIDI file to output_path.
    voice_filter can be 'all', a single voice name string, or a list of voice names.
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
    for voice_name, notes in score['voices'].items():
        # Apply voice filter
        if voice_filter != 'all':
            if isinstance(voice_filter, list):
                if voice_name.upper() not in [v.upper() for v in voice_filter]:
                    continue
            elif voice_name.upper() != voice_filter.upper():
                continue

        channel = VOICE_CHANNELS.get(voice_name, 0)
        program = VOICE_PROGRAMS.get(voice_name, 52)

        track = voice_to_midi_track(notes, channel,
                                     voice_name=voice_name)
        track.insert(0, MetaMessage('track_name', name=voice_name, time=0))
        track.insert(1, Message('program_change', program=program,
                                 channel=channel, time=0))

        # Per-voice channel volume (MIDI CC 7) — soloist louder, rest quieter
        volume = 100  # default when no solo selected
        if voice_volumes and voice_name in voice_volumes:
            volume = max(0, min(127, voice_volumes[voice_name]))
        track.insert(2, Message('control_change', control=7, value=volume,
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
SOPRANO: l.l:m.m:f :r| s:s:l:l |
ALTO: m:m:r:r | m:m:d:d |
TENOR: s:f:m:r | d:t1:d:m |
BASS: d:l1:d:t1 | d:-:-:- |
"""
    generate_midi_file(sample_score, output_path='test_output.mid')