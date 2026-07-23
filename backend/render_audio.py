import os
import subprocess

SOUNDFONT_PATH = os.path.join(os.path.dirname(__file__), 'soundfonts', 'MuseScore_General.sf2')

FLUIDSYNTH_EXE = os.path.join(os.path.expanduser('~'), 
                               'Downloads',
                               'fluidsynth-v2.5.5-win10-x64-cpp11',
                               'fluidsynth-v2.5.5-win10-x64-cpp11',
                               'bin', 'fluidsynth.exe')


def render_midi_to_audio(midi_path, output_path='output.wav'):
    if not os.path.exists(SOUNDFONT_PATH):
        raise FileNotFoundError(f"Soundfont not found at: {SOUNDFONT_PATH}")
    if not os.path.exists(midi_path):
        raise FileNotFoundError(f"MIDI file not found at: {midi_path}")
    if not os.path.exists(FLUIDSYNTH_EXE):
        raise FileNotFoundError(f"FluidSynth not found at: {FLUIDSYNTH_EXE}")

    cmd = [
        FLUIDSYNTH_EXE,
        '-ni',
        '-g', '1.5',
        '-o', 'synth.reverb.active=no',
        '-F', output_path,
        SOUNDFONT_PATH,
        midi_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0 and os.path.exists(output_path):
        print(f"Audio rendered successfully: {output_path}")
    else:
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)
        raise RuntimeError("FluidSynth rendering failed")

    return output_path


if __name__ == '__main__':
    midi_file = os.path.join(os.path.dirname(__file__), 'test_output.mid')
    render_midi_to_audio(midi_file, output_path='test_output.wav')