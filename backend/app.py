from flask import Flask, request, jsonify, send_file
import os
import uuid
from parser import parse_score
from generate_midi import generate_midi_file
from render_audio import render_midi_to_audio

app = Flask(__name__)

# Temporary folder for generated files
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'outputs')
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.route('/')
def index():
    return jsonify({'message': 'Solfa API is running!'})


@app.route('/api/generate', methods=['POST'])
def generate():
    """
    Accepts a JSON body like:
    {
        "score": "KEY: F_MAJOR\nTIME: 4/4\nTEMPO: 90\nSOPRANO: d:r:m:f | s:s:m:d |",
        "voice": "all",
        "tempo": 90
    }
    Returns a WAV audio file.
    """
    data = request.get_json()

    if not data or 'score' not in data:
        return jsonify({'error': 'No score provided'}), 400

    score_text = data['score']
    voice = data.get('voice', 'all')
    tempo_override = data.get('tempo', None)

    # Override tempo if provided
    if tempo_override:
        lines = score_text.strip().splitlines()
        new_lines = []
        for line in lines:
            if line.upper().startswith('TEMPO:'):
                new_lines.append(f'TEMPO: {tempo_override}')
            else:
                new_lines.append(line)
        score_text = '\n'.join(new_lines)

    # Generate unique filenames
    unique_id = str(uuid.uuid4())[:8]
    midi_path = os.path.join(OUTPUT_DIR, f'{unique_id}.mid')
    wav_path = os.path.join(OUTPUT_DIR, f'{unique_id}.wav')

    try:
        # Generate MIDI
        generate_midi_file(score_text, output_path=midi_path, voice_filter=voice)

        # Render to WAV
        render_midi_to_audio(midi_path, output_path=wav_path)

        # Return the WAV file
        return send_file(wav_path, mimetype='audio/wav',
                         as_attachment=False,
                         download_name='output.wav')

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/parse', methods=['POST'])
def parse():
    """
    Accepts a JSON body like:
    {
        "score": "KEY: F_MAJOR\nSOPRANO: d:r:m:f |"
    }
    Returns parsed MIDI note data as JSON.
    """
    data = request.get_json()
    if not data or 'score' not in data:
        return jsonify({'error': 'No score provided'}), 400

    try:
        result = parse_score(data['score'])
        # Convert tuples to lists for JSON serialization
        for voice in result['voices']:
            result['voices'][voice] = [
                {'midi': n, 'duration': d}
                for n, d in result['voices'][voice]
            ]
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)