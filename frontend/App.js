import { useState, useEffect, useRef, useMemo } from 'react';
import { createAudioPlayer } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Platform, Animated, Switch,
} from 'react-native';

const API_URL = 'https://solfa-backend-m5ij.onrender.com';

const KEYS = ['C', 'C#', 'D', 'E', 'F', 'F#', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab'];
const KEY_MAP = {
  C: 'C_MAJOR', 'C#': 'CS_MAJOR', D: 'D_MAJOR', E: 'E_MAJOR',
  F: 'F_MAJOR', 'F#': 'FS_MAJOR', G: 'G_MAJOR',
  A: 'A_MAJOR', B: 'B_MAJOR', Bb: 'Bb_MAJOR', Eb: 'Eb_MAJOR', Ab: 'Ab_MAJOR',
};

const SIMPLE_TIMES = ['2/4', '2/2', '3/8', '3/4', '3/2', '4/8', '4/4', '4/2'];
const REQUIRED_BEATS = {
  '2/4': 2.0, '2/2': 2.0, '3/8': 3.0, '3/4': 3.0,
  '3/2': 3.0, '4/8': 4.0, '4/4': 4.0, '4/2': 4.0,
};
function getRequiredBeats(t) { return REQUIRED_BEATS[t] || 4.0; }

const TEMPOS = [
  { name: 'Largo', bpm: 50 },
  { name: 'Adagio', bpm: 72 },
  { name: 'Andante', bpm: 92 },
  { name: 'Moderato', bpm: 114 },
  { name: 'Allegro', bpm: 138 },
  { name: 'Vivace', bpm: 166 },
];

const VOICES = ['SOPRANO', 'ALTO', 'TENOR', 'BASS'];
const STANDARD_NOTES = ['d', 'r', 'm', 'f', 's', 'l', 't'];
const CHROMATIC_ASC = ['di', 'ri', 'fi', 'si', 'li'];
const CHROMATIC_DESC = ['ra', 'me', 'se', 'le', 'te'];
const VALID_NOTES = new Set([...STANDARD_NOTES, ...CHROMATIC_ASC, ...CHROMATIC_DESC]);

const DURATIONS = [
  { symbol: ':', label: 'Full', value: 1.0, sub: '1 beat' },
  { symbol: '.', label: 'Half', value: 0.5, sub: '0.5' },
  { symbol: ',', label: 'Qtr', value: 0.25, sub: '0.25' },
  { symbol: '.,', label: '3-Qtr', value: 0.75, sub: '0.75' },
  { symbol: "''", label: 'Triplet', value: 0.333, sub: '0.33' },
];

function getEntryBeatValue(entry) {
  if (!entry) return 0;

  function suffixValue(suf) {
    if (suf === "''") return 0.333;
    if (suf === '.,') return 0.75;
    if (suf === '.') return 0.5;
    if (suf === ',') return 0.25;
    return 1.0;
  }

  const TWO_CHAR = ['di','ri','fi','si','li','ra','me','se','le','te'];
  let i = 0;
  let total = 0;

  while (i < entry.length) {
    const ch = entry[i];

    if (ch === ':' || ch === '/') { i++; continue; }

    if (ch === '-' || ch.toLowerCase() === 'x') {
      i++;
      let suf = '';
      if (entry.slice(i, i + 2) === "''") { suf = "''"; i += 2; }
      else if (entry.slice(i, i + 2) === '.,') { suf = '.,'; i += 2; }
      else if (entry[i] === '.') { suf = '.'; i++; }
      else if (entry[i] === ',') { suf = ','; i++; }
      total += suffixValue(suf);
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      const two = entry.slice(i, i + 2).toLowerCase();
      if (TWO_CHAR.includes(two)) i += 2;
      else i += 1;

      if (entry[i] === "'") i++;
      else if (/[0-9]/.test(entry[i])) i++;

      let suf = '';
      if (entry.slice(i, i + 2) === "''") { suf = "''"; i += 2; }
      else if (entry.slice(i, i + 2) === '.,') { suf = '.,'; i += 2; }
      else if (entry[i] === '.') { suf = '.'; i++; }
      else if (entry[i] === ',') { suf = ','; i++; }
      total += suffixValue(suf);
      continue;
    }

    i++;
  }

  return total;
}

function getOpenGroupTotalBeforeCursor(barEntries, cursorIndex) {
  if (cursorIndex === 0) return 0;
  const last = barEntries[cursorIndex - 1];
  if (!last) return 0;
  if (last.endsWith(':')) return 0;
  let total = 0;
  for (let i = cursorIndex - 1; i >= 0; i--) {
    const e = barEntries[i];
    if (e.endsWith(':')) break;
    total += getEntryBeatValue(e);
  }
  return total;
}

function buildSolfaText(grid, key, timeSig, tempo, selectedVoices, barFilter) {
  const requiredBeats = getRequiredBeats(timeSig);
  const restBeatCount = Math.max(1, Math.round(requiredBeats));

  let text = `KEY: ${KEY_MAP[key]}\nTIME: ${timeSig}\nTEMPO: ${tempo}\n`;
  VOICES.forEach((voice, vi) => {
    const isAll = selectedVoices.includes('all');
    if (!isAll && !selectedVoices.includes(voice)) return;
    text += `${voice}: `;
    grid[vi].forEach((bar, bi) => {
      if (barFilter !== null && bi !== barFilter) return;
      if (bar.length > 0) {
        text += bar.join('') + ' | ';
      } else {
        text += 'x:'.repeat(restBeatCount) + ' | ';
      }
    });
    text += '\n';
  });
  return text;
}


function makeEmptyGrid(n) {
  return Array(4).fill(null).map(() => Array(n).fill(null).map(() => []));
}

function PressableScale({ style, children, disabled, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  function onPressIn() {
    if (disabled) return;
    Animated.timing(scale, { toValue: 0.98, duration: 100, useNativeDriver: true }).start();
  }
  function onPressOut() {
    if (disabled) return;
    Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={style}
      {...rest}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function App() {
  const [isLight, setIsLight] = useState(false);
  const C = isLight ? LIGHT_THEME : DARK_THEME;
  const styles = useMemo(() => createStyles(C), [isLight]);

  const [selectedKey, setSelectedKey] = useState('F');
  const [selectedTime, setSelectedTime] = useState('4/4');
  const [selectedTempo, setSelectedTempo] = useState(TEMPOS[2]);
  const [numBars, setNumBars] = useState(4);
  const [isLooping, setIsLooping] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [grid, setGrid] = useState(makeEmptyGrid(4));
  const [activeCell, setActiveCell] = useState({ voice: 0, bar: 0, noteIndex: 0});
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [selectedVoices, setSelectedVoices] = useState(['all']);
  const [soloVoices, setSoloVoices] = useState([]);
  const [backgroundVolume, setBackgroundVolume] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Ready to play');
  const [statusType, setStatusType] = useState('ready');
  const [pendingNote, setPendingNote] = useState(null);
  const [keyError, setKeyError] = useState('');
  const [showChromatic, setShowChromatic] = useState(false);
  const [barInputText, setBarInputText] = useState('');
  const [cursorBlink, setCursorBlink] = useState(true);
  const [overflowWarning, setOverflowWarning] = useState('');
  const [copiedBar, setCopiedBar] = useState(null);

  // Load saved score when app starts
  useEffect(() => {
    async function loadSavedScore() {
      try {
        const saved = await AsyncStorage.getItem('solfa_saved_score');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.grid) setGrid(parsed.grid);
          if (parsed.numBars) setNumBars(parsed.numBars);
          if (parsed.selectedKey) setSelectedKey(parsed.selectedKey);
          if (parsed.selectedTime) setSelectedTime(parsed.selectedTime);
          if (parsed.selectedTempo) setSelectedTempo(parsed.selectedTempo);
        }
      } catch (e) {
        console.log('Could not load saved score', e);
      }
    }
    loadSavedScore();
  }, []);

  // Auto-save score whenever it changes
  useEffect(() => {
    async function saveScore() {
      try {
        const dataToSave = {
          grid,
          numBars,
          selectedKey,
          selectedTime,
          selectedTempo,
        };
        await AsyncStorage.setItem('solfa_saved_score', JSON.stringify(dataToSave));
      } catch (e) {
        console.log('Could not save score', e);
      }
    }
    saveScore();
  }, [grid, numBars, selectedKey, selectedTime, selectedTempo]);

  useEffect(() => {
    if (!keyboardVisible) return;
    const interval = setInterval(() => setCursorBlink(b => !b), 530);
    return () => clearInterval(interval);
  }, [keyboardVisible]);

  function getBar(vi, bi) { return (grid[vi] && grid[vi][bi]) || []; }

function addEntry(vi, bi, entry) {
    setGrid(prev => {
      const next = prev.map(v => v.map(b => [...b]));
      const bar = next[vi][bi];
      const idx = Math.min(activeCell.noteIndex, bar.length);
      bar.splice(idx, 0, entry);
      return next;
    });
    setActiveCell(prev => ({ ...prev, noteIndex: prev.noteIndex + 1 }));
  }

  function deleteLastEntry(vi, bi) {
    setGrid(prev => {
      const next = prev.map(v => v.map(b => [...b]));
      const bar = next[vi][bi];
      const idx = activeCell.noteIndex > 0 ? activeCell.noteIndex - 1 : bar.length - 1;
      if (idx >= 0 && idx < bar.length) bar.splice(idx, 1);
      return next;
    });
    setActiveCell(prev => ({ ...prev, noteIndex: Math.max(0, prev.noteIndex - 1) }));
    setPendingNote(null);
    setOverflowWarning('');
  }

  function clearBar(vi, bi) {
    setGrid(prev => {
      const next = prev.map(v => v.map(b => [...b]));
      next[vi][bi] = [];
      return next;
    });
    setPendingNote(null);
    setOverflowWarning('');
  }

  function copyBar(vi, bi) {
    const entries = [...getBar(vi, bi)];
    setCopiedBar({ voice: vi, entries });
    setStatusMessage(`Bar ${bi + 1} copied! Tap another bar and press Paste.`);
    setStatusType('ready');
  }

  function pasteBar(vi, bi) {
    if (!copiedBar) {
      setStatusMessage('No bar copied yet. Long-press a bar to copy it first.');
      setStatusType('warning');
      return;
    }
    setGrid(prev => {
      const next = prev.map(v => v.map(b => [...b]));
      next[vi][bi] = [...copiedBar.entries];
      return next;
    });
    setStatusMessage(`Pasted into Bar ${bi + 1} ✓`);
    setStatusType('ready');
  }

 function handleCellTap(vi, bi) {
    const bar = getBar(vi, bi);
    setActiveCell({ voice: vi, bar: bi, noteIndex: bar.length });
    setPendingNote(null);
    setKeyError('');
    setBarInputText('');
    setOverflowWarning('');
    setKeyboardVisible(true);
  }

  function handleCellLongPress(vi, bi) {
    copyBar(vi, bi);
  }

  function moveLeft() {
    setActiveCell(prev => {
      if (prev.noteIndex > 0) {
        return { ...prev, noteIndex: prev.noteIndex - 1 };
      }
      if (prev.bar > 0) {
        const prevBarLen = getBar(prev.voice, prev.bar - 1).length;
        return { ...prev, bar: prev.bar - 1, noteIndex: prevBarLen };
      }
      return prev;
    });
    setPendingNote(null);
    setOverflowWarning('');
  }

  function moveRight() {
    setActiveCell(prev => {
      const barLen = getBar(prev.voice, prev.bar).length;
      if (prev.noteIndex < barLen) {
        return { ...prev, noteIndex: prev.noteIndex + 1 };
      }
      if (prev.bar + 1 < numBars) {
        return { ...prev, bar: prev.bar + 1, noteIndex: 0 };
      }
      return prev;
    });
    setPendingNote(null);
    setOverflowWarning('');
  }

  function getCurrentBarBeats(vi, bi) {
    return getBar(vi, bi).reduce((t, e) => t + getEntryBeatValue(e), 0);
  }

  function checkOverflow(voice, bar, durationValue) {
    const required = getRequiredBeats(selectedTime);
    const currentBeats = getCurrentBarBeats(voice, bar);
    const remaining = required - currentBeats;
    if (durationValue > remaining + 0.001) {
      setOverflowWarning(
        `⚠️ Only ${remaining.toFixed(2)} beats left in Bar ${bar + 1}. This needs ${durationValue} beats.`
      );
      return false;
    }
    setOverflowWarning('');
    return true;
  }

  function commitEntry(syllable, octave, durationSymbol, durationValue) {
    const { voice, bar } = activeCell;
    if (!checkOverflow(voice, bar, durationValue)) return;

    const entry = `${syllable}${octave || ''}${durationSymbol}`;
    addEntry(voice, bar, entry);
    setPendingNote(null);
    setKeyError('');
    setOverflowWarning('');
    setStatusMessage('Note added ✓');
    setStatusType('ready');

    setTimeout(() => {
      const required = getRequiredBeats(selectedTime);
      const newBeats = getCurrentBarBeats(voice, bar) + durationValue;
      if (newBeats >= required - 0.001 && bar + 1 < numBars) {
        setActiveCell({ voice, bar: bar + 1, noteIndex: 0 });
      }
    }, 50);
  }

  function commitBarInput() {
    const text = barInputText.trim();
    if (!text) return;
    const { voice, bar } = activeCell;
    const cleaned = text.replace(/\|/g, ' ').trim();

    const tokens = [];
    let current = '';
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === ':' || cleaned[i] === '/') {
        if (current.trim()) tokens.push(current.trim() + cleaned[i]);
        current = '';
      } else {
        current += cleaned[i];
      }
    }
    if (current.trim()) tokens.push(current.trim() + ':');

    if (tokens.length === 0) return;

    setGrid(prev => {
      const next = prev.map(v => v.map(b => [...b]));
      next[voice][bar] = tokens;
      return next;
    });
    setBarInputText('');
    setStatusMessage(`Bar ${bar + 1} updated ✓`);
    setStatusType('ready');
  }

  function handleNoteTap(syllable) {
    setPendingNote({ syllable, octave: '', isSpecial: false });
    setKeyError('');
    checkOverflow(activeCell.voice, activeCell.bar, 1.0);
  }

  function handleSpecialNoteTap(type) {
    setPendingNote({ syllable: type === 'hold' ? '-' : 'x', octave: '', isSpecial: true });
    setKeyError('');
    checkOverflow(activeCell.voice, activeCell.bar, 1.0);
  }

  function handleOctaveTap(direction) {
    const marker = direction === 'upper' ? "'" : '1';
    setPendingNote(prev => {
      if (!prev) return { syllable: null, octave: marker, isSpecial: false };
      return { ...prev, octave: prev.octave === marker ? '' : marker };
    });
  }

  function handleDurationTap(symbol, value) {
    if (!pendingNote?.syllable) {
      setStatusMessage('Select a note first, then its duration.');
      setStatusType('warning');
      return;
    }
    const { voice, bar, noteIndex } = activeCell;
    if (!checkOverflow(voice, bar, value)) return;

    let entry;
    if (pendingNote.isSpecial) {
      entry = `${pendingNote.syllable}${symbol}`;
    } else {
      entry = `${pendingNote.syllable}${pendingNote.octave || ''}${symbol}`;
    }

    const barEntries = getBar(voice, bar);
    const openTotal = getOpenGroupTotalBeforeCursor(barEntries, noteIndex);
    const groupSum = openTotal + value;
    if (groupSum >= 1.0 - 0.001 && !entry.endsWith(':')) {
      entry = entry + ':';
    }

    addEntry(voice, bar, entry);
    setPendingNote(null);
    setOverflowWarning('');
    setStatusMessage('Added ✓');
    setStatusType('ready');

    setTimeout(() => {
      const required = getRequiredBeats(selectedTime);
      const newBeats = getCurrentBarBeats(voice, bar) + value;
      if (newBeats >= required - 0.001 && bar + 1 < numBars) {
        setActiveCell({ voice, bar: bar + 1, noteIndex: 0 });
      }
    }, 50);
  }

  function toggleVoice(voice) {
    setSelectedVoices(prev => {
      if (voice === 'all') return ['all'];
      const withoutAll = prev.filter(v => v !== 'all');
      if (withoutAll.includes(voice)) {
        const updated = withoutAll.filter(v => v !== voice);
        return updated.length === 0 ? ['all'] : updated;
      } else {
        return [...withoutAll, voice];
      }
    });
  }

  function toggleSolo(voice) {
    setSoloVoices(prev =>
     prev.includes(voice) ? prev.filter(v => v !== voice) : [...prev, voice]
   );
  }

  useEffect(() => {
    if (!keyboardVisible) return;
    if (Platform.OS !== 'web') return;
    let buffer = '';
    let bufferTimer = null;

    function handleKeyDown(e) {
      if (e.ctrlKey || e.metaKey) return;
      if (e.target && e.target.tagName === 'INPUT') return;

      const key = e.key.toLowerCase();

      if (key === 'arrowleft') { e.preventDefault(); moveLeft(); return; }
      if (key === 'arrowright') { e.preventDefault(); moveRight(); return; }
      if (key === 'arrowup') { e.preventDefault(); handleOctaveTap('upper'); return; }
      if (key === 'arrowdown') { e.preventDefault(); handleOctaveTap('lower'); return; }
      if (key === 'backspace') { e.preventDefault(); deleteLastEntry(activeCell.voice, activeCell.bar); return; }
      if (key === 'escape') { setKeyboardVisible(false); return; }
      if (key === '-') { handleSpecialNoteTap('hold'); return; }
      if (key === 'x') { handleSpecialNoteTap('rest'); return; }

      if (key === 'enter' || key === '1') { e.preventDefault(); if (pendingNote?.syllable) handleDurationTap(':', 1.0); return; }
      if (key === '2') { if (pendingNote?.syllable) handleDurationTap('.', 0.5); return; }
      if (key === '3') { if (pendingNote?.syllable) handleDurationTap(',', 0.25); return; }
      if (key === '4') { if (pendingNote?.syllable) handleDurationTap('.,', 0.75); return; }
      if (key === '5') { if (pendingNote?.syllable) handleDurationTap("''", 0.333); return; }

      if (key.length === 1 && /[a-z]/.test(key)) {
        buffer += key;
        clearTimeout(bufferTimer);
        if (VALID_NOTES.has(buffer)) {
          setPendingNote({ syllable: buffer, octave: '', isSpecial: false });
          setKeyError('');
          checkOverflow(activeCell.voice, activeCell.bar, 1.0);
          bufferTimer = setTimeout(() => { buffer = ''; }, 400);
        } else if (buffer.length >= 2) {
          setKeyError(`"${buffer}" is not a valid solfa note.`);
          setTimeout(() => setKeyError(''), 2500);
          buffer = '';
        } else {
          bufferTimer = setTimeout(() => {
            if (!VALID_NOTES.has(buffer)) {
              setKeyError(`"${buffer}" is not a valid note. Use: d r m f s l t`);
              setTimeout(() => setKeyError(''), 2500);
            }
            buffer = '';
          }, 400);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(bufferTimer);
    };
  }, [keyboardVisible, pendingNote, activeCell, grid, selectedTime, numBars]);

  async function playScore(barFilter = null) {
    const solfaText = buildSolfaText(grid, selectedKey, selectedTime, selectedTempo.bpm, selectedVoices, barFilter);
    setIsLoading(true);
    setStatusMessage(barFilter !== null ? `Playing Bar ${barFilter + 1}...` : 'Generating audio...');
    setStatusType('loading');

    // Build per-voice volumes if any soloists are marked
    let voiceVolumes = null;
    if (soloVoices.length > 0) {
      voiceVolumes = {};
      ['SOPRANO', 'ALTO', 'TENOR', 'BASS'].forEach(v => {
        voiceVolumes[v] = soloVoices.includes(v) ? 127 : backgroundVolume;
      });
    }

    try {
      const response = await fetch(`${API_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: solfaText,
          voice: selectedVoices.includes('all') ? 'all' : selectedVoices[0],
          voices: selectedVoices.includes('all') ? null : selectedVoices,
          tempo: selectedTempo.bpm,
          voiceVolumes: voiceVolumes,
        }),
      });
      if (!response.ok) throw new Error('Server error');

      if (Platform.OS === 'web') {
        const blob = await response.blob();
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.currentTime = 0;
          currentAudio.loop = false;
          currentAudio.src = '';
        }
        const audio = new window.Audio(URL.createObjectURL(blob));
        audio.loop = isLooping;
        setCurrentAudio(audio);
        audio.play();
      } else {
        if (currentAudio) {
          try {
            currentAudio.pause();
            currentAudio.remove();
          } catch (e) {}
        }

        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        function bytesToBase64(bytes) {
          let result = '';
          let i;
          for (i = 0; i + 2 < bytes.length; i += 3) {
            result += BASE64_CHARS[bytes[i] >> 2];
            result += BASE64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
            result += BASE64_CHARS[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
            result += BASE64_CHARS[bytes[i + 2] & 63];
          }
          const remaining = bytes.length - i;
          if (remaining === 1) {
            result += BASE64_CHARS[bytes[i] >> 2];
            result += BASE64_CHARS[(bytes[i] & 3) << 4];
            result += '==';
          } else if (remaining === 2) {
            result += BASE64_CHARS[bytes[i] >> 2];
            result += BASE64_CHARS[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
            result += BASE64_CHARS[(bytes[i + 1] & 15) << 2];
            result += '=';
          }
          return result;
        }

        const base64data = 'data:audio/wav;base64,' + bytesToBase64(bytes);

        const player = createAudioPlayer({ uri: base64data });
        player.loop = isLooping;
        setCurrentAudio(player);
        player.play();
      }

      setStatusMessage(barFilter !== null ? `Playing Bar ${barFilter + 1} 🎵` : 'Playing 🎵');
      setStatusType('playing');
    } catch (err) {
      setStatusMessage(`Error: ${err.message}`);
      setStatusType('error');
    } finally {
      setIsLoading(false);
    }
  }

  function handleAddBar() {
    if (numBars >= 200) return;
    setGrid(prev => prev.map(v => [...v, []]));
    setNumBars(n => n + 1);
  }

  function handleRemoveBar() {
    if (numBars <= 1) return;
    setGrid(prev => prev.map(v => v.slice(0, -1)));
    setNumBars(n => {
      const newN = n - 1;
      setActiveCell(prev => ({ ...prev, bar: Math.min(prev.bar, newN - 1) }));
      return newN;
    });
  }

  function renderPillRow(items, selected, onSelect, labelFn) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ width: '100%', marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
          {items.map(item => {
            const isSelected = item === selected;
            return (
              <PressableScale
                key={String(labelFn ? item.name : item)}
                style={[styles.pill, isSelected && styles.pillActive]}
                onPress={() => onSelect(item)}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                  {labelFn ? labelFn(item) : String(item)}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  function renderVoiceSelector() {
    return (
      <View style={styles.voiceSelectorRow}>
        {['all', ...VOICES].map(v => {
          const isSelected = selectedVoices.includes(v);
          const isSolo = soloVoices.includes(v);
          return (
            <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <PressableScale
                style={[styles.voiceToggleBtn, isSelected && styles.voiceToggleBtnActive]}
                onPress={() => toggleVoice(v)}
              >
                <Text style={[styles.voiceToggleText, isSelected && styles.voiceToggleTextActive]}>
                  {v}
                </Text>
              </PressableScale>
              {v !== 'all' && (
                <PressableScale
                  onPress={() => toggleSolo(v)}
                  style={{ padding: 8, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{
                    fontSize: 16,
                    color: C.gold,
                    opacity: isSolo ? 1 : 0.55,
                    textShadowColor: isSolo ? 'rgba(255,201,74,0.55)' : 'transparent',
                    textShadowOffset: { width: 0, height: 0 },
                    textShadowRadius: isSolo ? 4 : 0,
                  }}>⭐</Text>
                </PressableScale>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  function renderGrid() {
    const required = getRequiredBeats(selectedTime);
    return (
      <View style={styles.gridContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={styles.gridHeaderRow}>
              <View style={styles.voiceLabelBox} />
              {Array.from({ length: numBars }).map((_, b) => (
                <View key={b} style={styles.barHeader}>
                  <Text style={styles.barHeaderText}>Bar {b + 1}</Text>
                  <PressableScale style={styles.barPlayBtn} onPress={() => playScore(b)}>
                    <Text style={styles.barPlayBtnText}>▶</Text>
                  </PressableScale>
                </View>
              ))}
            </View>

            {VOICES.map((voice, vi) => (
              <View key={vi} style={styles.voiceRow}>
                <View style={styles.voiceLabelBox}>
                  <Text style={styles.voiceLabel}>{voice}</Text>
                </View>
                {Array.from({ length: numBars }).map((_, bi) => {
                  const barEntries = getBar(vi, bi);
                  const beats = getCurrentBarBeats(vi, bi);
                  const isComplete = Math.abs(beats - required) < 0.01;
                  const isOver = beats > required + 0.001;
                  const isActive = activeCell.voice === vi && activeCell.bar === bi && keyboardVisible;

                  let counterColor = C.textSecondary;
                  let counterIcon = '○';
                  if (beats > 0 && !isComplete) { counterColor = C.warning; counterIcon = '⚠️'; }
                  if (isComplete) { counterColor = C.success; counterIcon = '✅'; }
                  if (isOver) { counterColor = C.error; counterIcon = '❌'; }

                  return (
                    <View key={bi} style={[styles.barCell, isActive && styles.barCellActive]}>
                      <PressableScale onPress={() => copyBar(vi, bi)} style={styles.barCopyBtn}>
                        <View style={styles.copyIconBack} />
                        <View style={styles.copyIconFront} />
                      </PressableScale>
                      <PressableScale
                        onPress={() => handleCellTap(vi, bi)}
                        onLongPress={() => handleCellLongPress(vi, bi)}
                        style={{ flex: 1 }}
                      >
                        <View style={styles.barCellNotes}>
                          {barEntries.length === 0 && !isActive ? (
                            <Text style={styles.emptyBarText}>tap to add</Text>
                          ) : (
                            <>
                              {barEntries.map((entry, ei) => (
                                <View key={ei} style={{ flexDirection: 'row', alignItems: 'center' }}>
                                  {isActive && activeCell.noteIndex === ei && (
                                    <Text style={[styles.cursor, { opacity: cursorBlink ? 1 : 0 }]}>|</Text>
                                  )}
                                  <View style={styles.noteChip}>
                                    <Text style={styles.noteChipText}>{entry}</Text>
                                  </View>
                                </View>
                              ))}
                              {isActive && activeCell.noteIndex === barEntries.length && (
                                <Text style={[styles.cursor, { opacity: cursorBlink ? 1 : 0 }]}>|</Text>
                              )}
                            </>
                          )}
                        </View>
                        <Text style={[styles.beatCounter, { color: counterColor }]}>
                          {counterIcon} {beats.toFixed(2)}/{required}
                        </Text>
                      </PressableScale>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  }

  function renderKeyboard() {
    if (!keyboardVisible) return null;
    const { voice, bar } = activeCell;
    const required = getRequiredBeats(selectedTime);
    const barBeats = getCurrentBarBeats(voice, bar);
    const remaining = required - barBeats;

    return (
      <View style={styles.keyboard}>
        <View style={styles.kbStatusBar}>
          <Text style={styles.kbStatusText} numberOfLines={1}>
            {VOICES[voice]} | Bar {bar + 1} | {barBeats.toFixed(2)}/{required} | {remaining.toFixed(2)} left
            {pendingNote?.syllable
              ? `  •  "${pendingNote.syllable}${pendingNote.octave || ''}" — pick duration`
              : '  •  Select note'}
          </Text>
          <PressableScale onPress={() => setKeyboardVisible(false)}>
            <Text style={styles.kbClose}>✕</Text>
          </PressableScale>
        </View>

        {overflowWarning ? <Text style={styles.overflowWarning}>{overflowWarning}</Text> : null}
        {keyError ? <Text style={styles.keyError}>{keyError}</Text> : null}

        <View style={styles.barInputRow}>
          <TextInput
            style={styles.barInput}
            value={barInputText}
            onChangeText={setBarInputText}
            placeholder="Type or paste bar e.g.  d:r:m:f"
            placeholderTextColor={C.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={commitBarInput}
            returnKeyType="done"
          />
          <PressableScale style={styles.barInputBtn} onPress={commitBarInput}>
            <Text style={styles.barInputBtnText}>✓</Text>
          </PressableScale>
        </View>

        <View style={styles.navRow}>
          <PressableScale style={styles.navBtn} onPress={moveLeft}>
            <Text style={styles.navBtnText}>← Prev</Text>
          </PressableScale>
          <PressableScale style={styles.navBtn} onPress={() => copyBar(voice, bar)}>
            <Text style={styles.navBtnText}>📋 Copy</Text>
          </PressableScale>
          <PressableScale style={styles.navBtn} onPress={() => pasteBar(voice, bar)}>
            <Text style={[styles.navBtnText, { color: copiedBar ? C.secondary : C.textSecondary }]}>
              📌 Paste
            </Text>
          </PressableScale>
          <PressableScale style={styles.navBtn} onPress={() => deleteLastEntry(voice, bar)}>
            <Text style={styles.navBtnText}>⌫ Del</Text>
          </PressableScale>
          <PressableScale style={styles.navBtn} onPress={() => clearBar(voice, bar)}>
            <Text style={[styles.navBtnText, { color: C.error }]}>🗑</Text>
          </PressableScale>
          <PressableScale style={styles.navBtn} onPress={moveRight}>
            <Text style={styles.navBtnText}>Next →</Text>
          </PressableScale>
        </View>

        <Text style={styles.kbSectionLabel}>NOTES  (keyboard: d r m f s l t  |  1–5=duration  |  Enter=full)</Text>
        <View style={styles.noteRow}>
          {STANDARD_NOTES.map(n => (
            <PressableScale
              key={n}
              style={[styles.noteBtn, pendingNote?.syllable === n && styles.noteBtnSelected]}
              onPress={() => handleNoteTap(n)}
            >
              <Text style={styles.noteBtnText}>{n}</Text>
            </PressableScale>
          ))}
        </View>

        <PressableScale style={styles.chromaticToggle} onPress={() => setShowChromatic(p => !p)}>
          <Text style={styles.chromaticToggleText}>
            {showChromatic ? '▲ Hide Chromatic' : '▼ Show Chromatic Notes (Di Ri Fi Si Li / Ra Me Se Le Te)'}
          </Text>
        </PressableScale>

        {showChromatic && (
          <View>
            <Text style={styles.kbSectionLabel}>ASCENDING (sharps)</Text>
            <View style={styles.noteRow}>
              {CHROMATIC_ASC.map(n => (
                <PressableScale
                  key={n}
                  style={[styles.noteBtn, styles.noteBtnChromatic, pendingNote?.syllable === n && styles.noteBtnSelected]}
                  onPress={() => handleNoteTap(n)}
                >
                  <Text style={styles.noteBtnText}>{n}</Text>
                </PressableScale>
              ))}
            </View>
            <Text style={styles.kbSectionLabel}>DESCENDING (flats)</Text>
            <View style={styles.noteRow}>
              {CHROMATIC_DESC.map(n => (
                <PressableScale
                  key={n}
                  style={[styles.noteBtn, styles.noteBtnChromatic, pendingNote?.syllable === n && styles.noteBtnSelected]}
                  onPress={() => handleNoteTap(n)}
                >
                  <Text style={styles.noteBtnText}>{n}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.kbSectionLabel}>OCTAVE  (keyboard: ↑ ↓)</Text>
        <View style={styles.octaveRow}>
          <PressableScale
            style={[styles.octaveBtn, pendingNote?.octave === "'" && styles.octaveBtnSelected]}
            onPress={() => handleOctaveTap('upper')}
          >
            <Text style={styles.octaveBtnText}>↑ Upper</Text>
          </PressableScale>
          <PressableScale
            style={[styles.octaveBtn, pendingNote?.octave === '1' && styles.octaveBtnSelected]}
            onPress={() => handleOctaveTap('lower')}
          >
            <Text style={styles.octaveBtnText}>↓ Lower</Text>
          </PressableScale>
        </View>

        <Text style={styles.kbSectionLabel}>BEAT DURATION  (1=Full  2=Half  3=Qtr  4=3Qtr  5=Triplet)</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map(d => {
            const wouldOverflow = d.value > remaining + 0.001;
            return (
              <PressableScale
                key={d.symbol}
                style={[styles.durationBtn, wouldOverflow && styles.durationBtnDisabled]}
                onPress={() => handleDurationTap(d.symbol, d.value)}
              >
                <Text style={styles.durationBtnText}>{d.symbol}</Text>
                <Text style={styles.durationBtnLabel}>{d.label}</Text>
                <Text style={styles.durationBtnSub}>{d.sub}</Text>
              </PressableScale>
            );
          })}
        </View>

        <Text style={styles.kbSectionLabel}>HOLD & REST  (keyboard: - = Hold  x = Rest, then pick duration above)</Text>
        <View style={styles.extrasRow}>
          <PressableScale
            style={[styles.extraBtn, pendingNote?.syllable === '-' && styles.noteBtnSelected]}
            onPress={() => handleSpecialNoteTap('hold')}
          >
            <Text style={styles.extraBtnText}>— Hold</Text>
            <Text style={styles.extraBtnSub}>pick duration →</Text>
          </PressableScale>
          <PressableScale
            style={[styles.extraBtn, pendingNote?.syllable === 'x' && styles.noteBtnSelected]}
            onPress={() => handleSpecialNoteTap('rest')}
          >
            <Text style={styles.extraBtnText}>x Rest</Text>
            <Text style={styles.extraBtnSub}>pick duration →</Text>
          </PressableScale>
        </View>
      </View>
    );
  }

  const statusColorMap = {
    ready: C.success, loading: C.secondary,
    playing: C.success, error: C.error, warning: C.warning,
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.headerBanner}>
          <View style={styles.headerRow}>
            <View style={styles.headerSpacer} />
            <View style={styles.headerTitleBlock}>
              <Text style={styles.title}>Solfa Harmony</Text>
              <Text style={styles.subtitle}>SATB VOCAL HARMONY GENERATOR</Text>
            </View>
            <View style={styles.themeToggleCorner}>
              <Text style={styles.themeToggleLabel}>Dark</Text>
              <Switch
                value={isLight}
                onValueChange={setIsLight}
                trackColor={{ false: C.input, true: C.crimson }}
                thumbColor={isLight ? C.secondary : C.textSecondary}
                ios_backgroundColor={C.input}
                style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
              />
              <Text style={styles.themeToggleLabel}>Light</Text>
            </View>
          </View>
        </View>

        <Text style={styles.label}>Select Key:</Text>
        {renderPillRow(KEYS, selectedKey, setSelectedKey)}

        <Text style={styles.label}>Time Signature:</Text>
        {renderPillRow(SIMPLE_TIMES, selectedTime, setSelectedTime)}

        <Text style={styles.label}>Tempo:</Text>
        {renderPillRow(TEMPOS, selectedTempo, setSelectedTempo, t => `${t.name}\n${t.bpm} BPM`)}

        <Text style={styles.label}>Score Grid:</Text>
        <Text style={styles.hint}>
          Tap bar to edit • ▶ plays that bar • Long-press to copy bar
          {copiedBar ? '  •  📋 Bar copied — tap a bar then press Paste' : ''}
        </Text>
        {renderGrid()}

        <View style={styles.barControlsRow}>
          <PressableScale style={styles.outlineBtn} onPress={handleAddBar} disabled={numBars >= 200}>
            <Text style={styles.outlineBtnText}>+ Add Bar</Text>
          </PressableScale>
          <PressableScale style={styles.outlineBtn} onPress={handleRemoveBar} disabled={numBars <= 1}>
            <Text style={styles.outlineBtnText}>− Remove Bar</Text>
          </PressableScale>
        </View>

        <Text style={styles.label}>Select Voice(s) to Play:</Text>
        <Text style={styles.hint}>Tap to toggle — select multiple voices at once</Text>
        {renderVoiceSelector()}

        <Text style={{ color: C.textSecondary, fontSize: 11, marginBottom: 4 }}>
          ⭐ = Solo (loud) • Tap the star next to a voice to make it the featured/soloist part while the rest stay soft in the background
        </Text>
        {soloVoices.length > 0 && (
          <View style={{ width: '100%', marginBottom: 8 }}>
            <Text style={{ color: C.textSecondary, fontSize: 11, marginBottom: 4 }}>
              Background volume: {backgroundVolume}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[20, 40, 60, 80, 100].map(v => (
                <PressableScale
                  key={v}
                  onPress={() => setBackgroundVolume(v)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
                    backgroundColor: backgroundVolume === v ? C.crimson : C.input,
                    borderWidth: 1, borderColor: C.border,
                  }}
                >
                  <Text style={{ color: C.offWhite, fontSize: 11 }}>{v}</Text>
                </PressableScale>
              ))}
            </View>
          </View>
        )}

        <PressableScale
          style={styles.scanBtn}
          onPress={() => { setStatusMessage('📷 Scan feature coming soon! 🚧'); setStatusType('warning'); }}
        >
          <Text style={styles.scanBtnText}>📷 Scan Typed Score</Text>
          <Text style={styles.scanBtnSub}>Coming Soon 🚧</Text>
        </PressableScale>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, width: '100%' }}>
          <PressableScale
            style={[styles.outlineBtn, isLooping && { backgroundColor: C.crimson }]}
            onPress={() => setIsLooping(l => !l)}
          >
            <Text style={styles.outlineBtnText}>{isLooping ? '🔁 Loop: ON' : '🔁 Loop: OFF'}</Text>
          </PressableScale>
          <PressableScale
            style={styles.outlineBtn}
            onPress={() => {
              if (currentAudio) {
                if (Platform.OS === 'web') {
                  currentAudio.pause();
                  currentAudio.currentTime = 0;
                  currentAudio.loop = false;
                  currentAudio.src = '';
                } else {
                  try {
                    currentAudio.pause();
                    currentAudio.remove();
                  } catch (e) {}
                }
              }
              setCurrentAudio(null);
              setIsLooping(false);
            }}
          >
            <Text style={styles.outlineBtnText}>⏹ Stop</Text>
          </PressableScale>
        </View>

        <PressableScale
          style={[styles.playBtn, isLoading && styles.playBtnDisabled]}
          onPress={() => playScore(null)}
          disabled={isLoading}
        >
          {isLoading
            ? <ActivityIndicator color={C.offWhite} />
            : <Text style={styles.playBtnText}>▶ Play Score</Text>
          }
        </PressableScale>

        <Text style={[styles.statusText, { color: statusColorMap[statusType] || C.success }]}>
          {statusMessage}
        </Text>

        <View style={{ height: keyboardVisible ? 500 : 40 }} />
      </ScrollView>

      {renderKeyboard()}
    </View>
  );
}

const DARK_THEME = {
  black: '#100B13',
  crimson: '#5C2A52',
  offWhite: '#FFFFFF',
  card: '#1C1620',
  input: '#251E29',
  border: '#332A38',
  borderStrong: '#453A4C',
  success: '#3DD57F',
  warning: '#ffb020',
  error: '#e63946',
  secondary: '#E39163',
  onSecondary: '#2A1608',
  textSecondary: '#AFA0B8',
  textFaint: '#6E6377',
  wineRing: '#D17FB3',
  wineText: '#E8B9D6',
  cardA: '#3B1F3E',
  cardB: '#7A3A5F',
  gold: '#FFC94A',
};

const LIGHT_THEME = {
  black: '#F5EEE6',
  crimson: '#E3C6D8',
  offWhite: '#241A20',
  card: '#EEE3DA',
  input: '#E6D8CE',
  border: '#D9C7BB',
  borderStrong: '#C7B0A2',
  success: '#1E9D5C',
  warning: '#B8860B',
  error: '#B0292F',
  secondary: '#A8502A',
  onSecondary: '#FFFFFF',
  textSecondary: '#8A7581',
  textFaint: '#B0A0AA',
  wineRing: '#8B3A5E',
  wineText: '#7A2E52',
  cardA: '#EAD2DB',
  cardB: '#DBBECB',
  gold: '#B8860B',
};

function createStyles(C) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: C.black },
  scrollContent: { padding: 20, alignItems: 'center' },
  headerBanner: { width: '100%', paddingVertical: 18, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  headerSpacer: { width: 88 },
  headerTitleBlock: { flex: 1, alignItems: 'center' },
  themeToggleCorner: { width: 88, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
  themeToggleLabel: { color: C.textSecondary, fontSize: 8.5, fontWeight: 'bold', letterSpacing: 0.3, fontFamily: 'Georgia' },
  title: { fontSize: 25, fontWeight: '900', color: C.offWhite, fontFamily: 'Georgia' },
  subtitle: { fontSize: 10.5, color: C.textSecondary, marginTop: 15, letterSpacing: 1.5, fontFamily: 'Georgia' },
  label: { alignSelf: 'flex-start', color: C.offWhite, fontWeight: 'bold', fontSize: 14, marginTop: 26, marginBottom: 10, letterSpacing: 0.4, fontFamily: 'Georgia' },
  hint: { alignSelf: 'flex-start', color: C.textSecondary, fontSize: 11, marginBottom: 10, lineHeight: 16 },
  pill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 14, backgroundColor: C.input, borderWidth: 1, borderColor: C.borderStrong },
  pillActive: {
    backgroundColor: C.crimson, borderWidth: 2, borderColor: C.wineRing,
    shadowColor: C.wineRing, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  pillText: { color: C.textSecondary, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  pillTextActive: { color: C.offWhite },
  voiceSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, width: '100%', marginBottom: 4, justifyContent: 'center' },
  voiceToggleBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 18, backgroundColor: C.input, borderWidth: 1, borderColor: C.borderStrong },
  voiceToggleBtnActive: {
    backgroundColor: C.crimson, borderColor: C.wineRing,
    shadowColor: C.wineRing, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 4,
  },
  voiceToggleText: { color: C.textSecondary, fontWeight: 'bold', fontSize: 13 },
  voiceToggleTextActive: { color: C.offWhite },
  gridContainer: { width: '100%', backgroundColor: C.card, borderRadius: 22, borderWidth: 1, borderColor: C.borderStrong, overflow: 'hidden' },
  gridHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.borderStrong, backgroundColor: C.input },
  voiceLabelBox: { width: 72, justifyContent: 'center', paddingLeft: 8, position: 'sticky', left: 0, backgroundColor: C.card, zIndex: 2 },
  barHeader: { width: 130, alignItems: 'center', paddingVertical: 8, borderLeftWidth: 1, borderLeftColor: C.border, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  barHeaderText: { color: C.textSecondary, fontSize: 11, fontWeight: 'bold', fontFamily: 'Georgia' },
  barPlayBtn: { backgroundColor: C.crimson, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  barPlayBtnText: { color: C.offWhite, fontSize: 10, fontWeight: 'bold' },
  voiceRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border },
  voiceLabel: { width: 72, color: C.textSecondary, fontWeight: 'bold', fontSize: 11, paddingVertical: 16, paddingHorizontal: 8, letterSpacing: 0.5, fontFamily: 'Georgia', textAlign: 'center' },
  barCell: { width: 130, minHeight: 84, padding: 10, borderLeftWidth: 1, borderLeftColor: C.border, justifyContent: 'space-between' },
  barCopyBtn: { position: 'absolute', top: 4, right: 4, padding: 6, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  barCopyBtnText: { fontSize: 12, color: C.textSecondary },
  copyIconBack: { position: 'absolute', top: 6, left: 8, width: 9, height: 9, borderWidth: 1.3, borderColor: C.textSecondary, borderRadius: 2 },
  copyIconFront: { position: 'absolute', top: 9, left: 5, width: 9, height: 9, borderWidth: 1.3, borderColor: C.textSecondary, borderRadius: 2, backgroundColor: C.card },
  barCellActive: { backgroundColor: 'rgba(92,42,82,0.2)', borderLeftColor: C.wineRing, borderLeftWidth: 2 },
  barCellNotes: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, flex: 1, alignItems: 'center' },
  emptyBarText: { color: C.textFaint, fontSize: 11, fontStyle: 'italic' },
  noteChip: { backgroundColor: C.crimson, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: C.wineRing },
  noteChipText: { color: C.offWhite, fontSize: 12, fontWeight: 'bold', fontFamily: 'Georgia' },
  cursor: { color: C.wineRing, fontSize: 18, fontWeight: 'bold', marginLeft: 1 },
  beatCounter: { fontSize: 10, fontWeight: 'bold', marginTop: 6 },
  barControlsRow: { flexDirection: 'row', width: '100%', marginTop: 18, gap: 10 },
  outlineBtn: { flex: 1, borderWidth: 1.5, borderColor: C.secondary, borderRadius: 18, paddingVertical: 11, alignItems: 'center' },
  outlineBtnText: { color: C.secondary, fontWeight: 'bold', fontFamily: 'Georgia' },
  scanBtn: { width: '100%', marginTop: 28, borderWidth: 1, borderColor: C.secondary, borderRadius: 18, paddingVertical: 14, alignItems: 'center', borderStyle: 'dashed' },
  scanBtnText: { color: C.secondary, fontWeight: 'bold', fontSize: 15, fontFamily: 'Georgia' },
  scanBtnSub: { color: C.textFaint, fontSize: 11, marginTop: 3 },
  playBtn: {
    marginTop: 20, width: '100%', backgroundColor: C.crimson, paddingVertical: 18, borderRadius: 20, alignItems: 'center', borderWidth: 1, borderColor: C.wineRing,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 14, elevation: 5,
  },
  playBtnDisabled: { opacity: 0.6 },
  playBtnText: { color: C.offWhite, fontSize: 17, fontWeight: 'bold', letterSpacing: 1, fontFamily: 'Georgia' },
  statusText: { marginTop: 14, fontSize: 14, textAlign: 'center', fontWeight: 'bold', fontFamily: 'Georgia', paddingBottom: 20 },
  keyboard: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.input, borderTopWidth: 1, borderTopColor: C.borderStrong,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.28, shadowRadius: 24, elevation: 12,
  },
  kbStatusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  kbStatusText: { color: C.offWhite, fontSize: 11, fontWeight: 'bold', flex: 1 },
  kbClose: { color: C.textSecondary, fontSize: 18, fontWeight: 'bold', padding: 8, width: 32, height: 32, textAlign: 'center' },
  overflowWarning: { color: C.warning, fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 6, backgroundColor: C.input, borderRadius: 10, padding: 6 },
  keyError: { color: C.error, fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 6, backgroundColor: C.input, borderRadius: 10, padding: 6 },
  barInputRow: { flexDirection: 'row', gap: 8, marginBottom: 12, alignItems: 'center' },
  barInput: { flex: 1, backgroundColor: C.black, borderWidth: 1, borderColor: C.borderStrong, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, color: C.offWhite, fontSize: 14, fontFamily: 'Courier New' },
  barInputBtn: { backgroundColor: C.secondary, borderRadius: 14, width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
  barInputBtnText: { color: C.onSecondary, fontWeight: 'bold', fontSize: 13 },
  navRow: { flexDirection: 'row', gap: 4, marginBottom: 12, flexWrap: 'wrap' },
  navBtn: { flex: 1, minWidth: 64, backgroundColor: 'transparent', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 14, paddingVertical: 9, alignItems: 'center' },
  navBtnText: { color: C.textSecondary, fontWeight: 'bold', fontSize: 10 },
  kbSectionLabel: { color: C.textSecondary, fontSize: 9, fontWeight: 'bold', letterSpacing: 1.2, marginTop: 10, marginBottom: 5 },
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 5, marginBottom: 8 },
  noteBtn: { flex: 1, backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 10, minHeight: 57, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.borderStrong },
  noteBtnChromatic: { borderColor: C.wineRing },
  noteBtnSelected: { backgroundColor: C.offWhite, borderColor: C.offWhite },
  noteBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 14, fontFamily: 'Courier New' },
  chromaticToggle: { backgroundColor: 'transparent', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: C.wineRing, borderStyle: 'dashed', marginTop: 8, marginBottom: 8, alignItems: 'center' },
  chromaticToggleText: { color: C.wineText, fontSize: 11, fontWeight: 'bold' },
  octaveRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  octaveBtn: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 14, paddingVertical: 9, alignItems: 'center' },
  octaveBtnSelected: { backgroundColor: C.crimson, borderColor: C.wineRing },
  octaveBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 12 },
  durationRow: { flexDirection: 'row', gap: 4, marginBottom: 10 },
  durationBtn: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 14, paddingVertical: 11, minHeight: 57, alignItems: 'center', justifyContent: 'center' },
  durationBtnDisabled: { opacity: 0.5 },
  durationBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 13 },
  durationBtnLabel: { color: C.textSecondary, fontSize: 9, marginTop: 4 },
  durationBtnSub: { color: C.textFaint, fontSize: 8, marginTop: 3 },
  extrasRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  extraBtn: { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: C.borderStrong, borderRadius: 14, paddingVertical: 9, alignItems: 'center' },
  extraBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 12 },
  extraBtnSub: { color: C.textFaint, fontSize: 9, marginTop: 3 },
  });
}