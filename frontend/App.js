import { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput,
  TouchableOpacity, ScrollView, ActivityIndicator
} from 'react-native';

const API_URL = 'http://127.0.0.1:5000';

export default function App() {
  const [score, setScore] = useState('');
  const [voice, setVoice] = useState('all');
  const [tempo, setTempo] = useState('90');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const voices = ['all', 'SOPRANO', 'ALTO', 'TENOR', 'BASS'];

  const handlePlay = async () => {
    if (!score.trim()) {
      setMessage('Please enter a solfa score!');
      return;
    }
    setLoading(true);
    setMessage('Generating audio...');
    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, voice, tempo: parseInt(tempo) }),
      });
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        setMessage('Playing audio! 🎵');
      } else {
        const err = await response.json();
        setMessage(`Error: ${err.error}`);
      }
    } catch (e) {
      setMessage(`Connection error: ${e.message}`);
    }
    setLoading(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>🎵 Solfa Harmony</Text>
      <Text style={styles.subtitle}>SATB Vocal Harmony Generator</Text>

      <Text style={styles.label}>Enter Solfa Score:</Text>
      <TextInput
        style={styles.input}
        multiline
        numberOfLines={6}
        placeholder={
          'KEY: F_MAJOR\nTIME: 4/4\nTEMPO: 90\n' +
          'SOPRANO: d:r:m:f | s:s:m:d |\n' +
          'ALTO: m:m:r:r | m:m:d:d |\n' +
          'TENOR: s:f:m:r | d:t1:d:m |\n' +
          'BASS: d:-:-:- | d:-:-:- |'
        }
        value={score}
        onChangeText={setScore}
      />

      <Text style={styles.label}>Select Voice:</Text>
      <View style={styles.voiceRow}>
        {voices.map(v => (
          <TouchableOpacity
            key={v}
            style={[styles.voiceBtn, voice === v && styles.voiceBtnActive]}
            onPress={() => setVoice(v)}
          >
            <Text style={[styles.voiceBtnText, voice === v && styles.voiceBtnTextActive]}>
              {v}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Tempo (BPM):</Text>
      <View style={styles.tempoRow}>
        {['60', '75', '90', '105', '120'].map(t => (
          <TouchableOpacity
            key={t}
            style={[styles.tempoBtn, tempo === t && styles.tempoBtnActive]}
            onPress={() => setTempo(t)}
          >
            <Text style={[styles.tempoBtnText, tempo === t && styles.tempoBtnTextActive]}>
              {t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.playBtn, loading && styles.playBtnDisabled]}
        onPress={handlePlay}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.playBtnText}>▶ Play Harmony</Text>
        }
      </TouchableOpacity>

      {message ? <Text style={styles.message}>{message}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#1a1a2e',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#e94560',
    marginTop: 40,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#a8a8b3',
    marginBottom: 32,
  },
  label: {
    alignSelf: 'flex-start',
    color: '#e94560',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    width: '100%',
    backgroundColor: '#16213e',
    color: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    fontFamily: 'monospace',
    borderWidth: 1,
    borderColor: '#e94560',
    minHeight: 160,
    textAlignVertical: 'top',
  },
  voiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  voiceBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#e94560',
  },
  voiceBtnActive: {
    backgroundColor: '#e94560',
  },
  voiceBtnText: {
    color: '#e94560',
    fontSize: 13,
    fontWeight: 'bold',
  },
  voiceBtnTextActive: {
    color: '#fff',
  },
  tempoRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  tempoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16213e',
    borderWidth: 1,
    borderColor: '#0f3460',
    alignItems: 'center',
  },
  tempoBtnActive: {
    backgroundColor: '#0f3460',
    borderColor: '#e94560',
  },
  tempoBtnText: {
    color: '#a8a8b3',
    fontWeight: 'bold',
  },
  tempoBtnTextActive: {
    color: '#fff',
  },
  playBtn: {
    marginTop: 32,
    width: '100%',
    backgroundColor: '#e94560',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
  },
  playBtnDisabled: {
    opacity: 0.6,
  },
  playBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  message: {
    marginTop: 16,
    color: '#a8a8b3',
    fontSize: 14,
    textAlign: 'center',
  },
});