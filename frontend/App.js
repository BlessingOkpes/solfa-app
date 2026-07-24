import { useState, useEffect } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput,
} from 'react-native';

const API_URL = 'http://localhost:5000';

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
         text += 'x: | ';
      }
    });
    text += '\n';
  });
  return text;
}

function makeEmptyGrid(n) {
  return Array(4).fill(null).map(() => Array(n).fill(null).map(() => []));
}

export default function App() {
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
     const blob = await response.blob();

      // Stop and clean up any previous audio before starting new one
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
    if (numBars >= 16) return;
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
              <TouchableOpacity
                key={String(labelFn ? item.name : item)}
                style={[styles.pill, isSelected && styles.pillActive]}
                onPress={() => onSelect(item)}
              >
                <Text style={[styles.pillText, isSelected && styles.pillTextActive]}>
                  {labelFn ? labelFn(item) : String(item)}
                </Text>
              </TouchableOpacity>
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
            <View key={v} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <TouchableOpacity
                style={[styles.voiceToggleBtn, isSelected && styles.voiceToggleBtnActive]}
                onPress={() => toggleVoice(v)}
              >
                <Text style={[styles.voiceToggleText, isSelected && styles.voiceToggleTextActive]}>
                  {v}
                </Text>
              </TouchableOpacity>
              {v !== 'all' && (
                <TouchableOpacity
                  onPress={() => toggleSolo(v)}
                  style={{ paddingHorizontal: 4 }}
                >
                  <Text style={{ fontSize: 16, opacity: isSolo ? 1 : 0.3 }}>⭐</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    );
  }

  function renderGrid() {
    return (
      <View style={styles.gridContainer}>
        <View style={styles.gridHeaderRow}>
          <View style={styles.voiceLabelBox} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row' }}>
              {Array.from({ length: numBars }).map((_, b) => (
                <View key={b} style={styles.barHeader}>
                  <Text style={styles.barHeaderText}>Bar {b + 1}</Text>
                  <TouchableOpacity style={styles.barPlayBtn} onPress={() => playScore(b)}>
                    <Text style={styles.barPlayBtnText}>▶</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        {VOICES.map((voice, vi) => {
          const required = getRequiredBeats(selectedTime);
          return (
            <View key={vi} style={styles.voiceRow}>
              <View style={styles.voiceLabelBox}>
                <Text style={styles.voiceLabel}>{voice}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row' }}>
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
                        <TouchableOpacity onPress={() => copyBar(vi, bi)} style={styles.barCopyBtn}>
                          <Text style={styles.barCopyBtnText}>📋</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
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
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          );
        })}
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
          <TouchableOpacity onPress={() => setKeyboardVisible(false)}>
            <Text style={styles.kbClose}>✕</Text>
          </TouchableOpacity>
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
          <TouchableOpacity style={styles.barInputBtn} onPress={commitBarInput}>
            <Text style={styles.barInputBtnText}>✓</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity style={styles.navBtn} onPress={moveLeft}>
            <Text style={styles.navBtnText}>← Prev</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => copyBar(voice, bar)}>
            <Text style={styles.navBtnText}>📋 Copy</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => pasteBar(voice, bar)}>
            <Text style={[styles.navBtnText, { color: copiedBar ? C.secondary : C.textSecondary }]}>
              📌 Paste
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => deleteLastEntry(voice, bar)}>
            <Text style={styles.navBtnText}>⌫ Del</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={() => clearBar(voice, bar)}>
            <Text style={[styles.navBtnText, { color: C.error }]}>🗑</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navBtn} onPress={moveRight}>
            <Text style={styles.navBtnText}>Next →</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.kbSectionLabel}>NOTES  (keyboard: d r m f s l t  |  1–5=duration  |  Enter=full)</Text>
        <View style={styles.noteRow}>
          {STANDARD_NOTES.map(n => (
            <TouchableOpacity
              key={n}
              style={[styles.noteBtn, pendingNote?.syllable === n && styles.noteBtnSelected]}
              onPress={() => handleNoteTap(n)}
            >
              <Text style={styles.noteBtnText}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.chromaticToggle} onPress={() => setShowChromatic(p => !p)}>
          <Text style={styles.chromaticToggleText}>
            {showChromatic ? '▲ Hide Chromatic' : '▼ Show Chromatic Notes (Di Ri Fi Si Li / Ra Me Se Le Te)'}
          </Text>
        </TouchableOpacity>

        {showChromatic && (
          <View>
            <Text style={styles.kbSectionLabel}>ASCENDING (sharps)</Text>
            <View style={styles.noteRow}>
              {CHROMATIC_ASC.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.noteBtn, styles.noteBtnChromatic, pendingNote?.syllable === n && styles.noteBtnSelected]}
                  onPress={() => handleNoteTap(n)}
                >
                  <Text style={styles.noteBtnText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.kbSectionLabel}>DESCENDING (flats)</Text>
            <View style={styles.noteRow}>
              {CHROMATIC_DESC.map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.noteBtn, styles.noteBtnChromatic, pendingNote?.syllable === n && styles.noteBtnSelected]}
                  onPress={() => handleNoteTap(n)}
                >
                  <Text style={styles.noteBtnText}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.kbSectionLabel}>OCTAVE  (keyboard: ↑ ↓)</Text>
        <View style={styles.octaveRow}>
          <TouchableOpacity
            style={[styles.octaveBtn, pendingNote?.octave === "'" && styles.octaveBtnSelected]}
            onPress={() => handleOctaveTap('upper')}
          >
            <Text style={styles.octaveBtnText}>↑ Upper</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.octaveBtn, pendingNote?.octave === '1' && styles.octaveBtnSelected]}
            onPress={() => handleOctaveTap('lower')}
          >
            <Text style={styles.octaveBtnText}>↓ Lower</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.kbSectionLabel}>BEAT DURATION  (1=Full  2=Half  3=Qtr  4=3Qtr  5=Triplet)</Text>
        <View style={styles.durationRow}>
          {DURATIONS.map(d => {
            const wouldOverflow = d.value > remaining + 0.001;
            return (
              <TouchableOpacity
                key={d.symbol}
                style={[styles.durationBtn, wouldOverflow && styles.durationBtnDisabled]}
                onPress={() => handleDurationTap(d.symbol, d.value)}
              >
                <Text style={styles.durationBtnText}>{d.symbol}</Text>
                <Text style={styles.durationBtnLabel}>{d.label}</Text>
                <Text style={styles.durationBtnSub}>{d.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.kbSectionLabel}>HOLD & REST  (keyboard: - = Hold  x = Rest, then pick duration above)</Text>
        <View style={styles.extrasRow}>
          <TouchableOpacity
            style={[styles.extraBtn, pendingNote?.syllable === '-' && styles.noteBtnSelected]}
            onPress={() => handleSpecialNoteTap('hold')}
          >
            <Text style={styles.extraBtnText}>— Hold</Text>
            <Text style={styles.extraBtnSub}>pick duration →</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.extraBtn, pendingNote?.syllable === 'x' && styles.noteBtnSelected]}
            onPress={() => handleSpecialNoteTap('rest')}
          >
            <Text style={styles.extraBtnText}>x Rest</Text>
            <Text style={styles.extraBtnSub}>pick duration →</Text>
          </TouchableOpacity>
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
          <Text style={styles.title}>🎵 Solfa Harmony</Text>
          <Text style={styles.subtitle}>SATB Vocal Harmony Generator</Text>
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
          <TouchableOpacity style={styles.outlineBtn} onPress={handleAddBar} disabled={numBars >= 16}>
            <Text style={styles.outlineBtnText}>+ Add Bar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.outlineBtn} onPress={handleRemoveBar} disabled={numBars <= 1}>
            <Text style={styles.outlineBtnText}>− Remove Bar</Text>
          </TouchableOpacity>
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
                <TouchableOpacity
                  key={v}
                  onPress={() => setBackgroundVolume(v)}
                  style={{
                    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
                    backgroundColor: backgroundVolume === v ? C.crimson : C.input,
                    borderWidth: 1, borderColor: C.border,
                  }}
                >
                  <Text style={{ color: C.offWhite, fontSize: 11 }}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.scanBtn}
          onPress={() => { setStatusMessage('📷 Scan feature coming soon! 🚧'); setStatusType('warning'); }}
        >
          <Text style={styles.scanBtnText}>📷 Scan Typed Score</Text>
          <Text style={styles.scanBtnSub}>Coming Soon 🚧</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, width: '100%' }}>
          <TouchableOpacity
            style={[styles.outlineBtn, isLooping && { backgroundColor: C.crimson }]}
            onPress={() => setIsLooping(l => !l)}
          >
            <Text style={styles.outlineBtnText}>{isLooping ? '🔁 Loop: ON' : '🔁 Loop: OFF'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.outlineBtn}
            onPress={() => {
              if (currentAudio) {
                currentAudio.pause();
                currentAudio.currentTime = 0;
                currentAudio.loop = false;
                currentAudio.src = '';
              }
              setCurrentAudio(null);
              setIsLooping(false);
            }}
          >
            <Text style={styles.outlineBtnText}>⏹ Stop</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.playBtn, isLoading && styles.playBtnDisabled]}
          onPress={() => playScore(null)}
          disabled={isLoading}
        >
          {isLoading
            ? <ActivityIndicator color={C.offWhite} />
            : <Text style={styles.playBtnText}>▶ Play Score</Text>
          }
        </TouchableOpacity>

        <Text style={[styles.statusText, { color: statusColorMap[statusType] || C.success }]}>
          {statusMessage}
        </Text>

        <View style={{ height: keyboardVisible ? 500 : 40 }} />
      </ScrollView>

      {renderKeyboard()}
    </View>
  );
}

const C = {
  black: '#000000',
  crimson: '#4a5e2a',
  offWhite: '#f5f0e8',
  card: '#0d0d0d',
  input: '#0a0f06',
  border: '#2a2a2a',
  success: '#06d6a0',
  warning: '#ffd60a',
  error: '#e63946',
  secondary: '#c9a040',
  textSecondary: '#7a8a6a',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.black },
  scrollContent: { padding: 20, alignItems: 'center' },
  headerBanner: { width: '100%', alignItems: 'center', paddingVertical: 24, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  title: { fontSize: 32, fontWeight: 'bold', color: C.secondary, letterSpacing: 2, fontFamily: 'Georgia' },
  subtitle: { fontSize: 13, color: C.textSecondary, marginTop: 4, letterSpacing: 3, fontFamily: 'Georgia' },
  label: { alignSelf: 'flex-start', color: C.offWhite, fontWeight: 'bold', fontSize: 13, marginTop: 20, marginBottom: 6, letterSpacing: 1, fontFamily: 'Georgia' },
  hint: { alignSelf: 'flex-start', color: C.textSecondary, fontSize: 11, marginBottom: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  pillActive: { backgroundColor: C.crimson, borderColor: C.secondary },
  pillText: { color: C.textSecondary, fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  pillTextActive: { color: C.offWhite },
  voiceSelectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', marginBottom: 4 },
  voiceToggleBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  voiceToggleBtnActive: { backgroundColor: C.crimson, borderColor: C.secondary },
  voiceToggleText: { color: C.textSecondary, fontWeight: 'bold', fontSize: 13 },
  voiceToggleTextActive: { color: C.offWhite },
  gridContainer: { width: '100%', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  gridHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: '#0a0f06' },
  voiceLabelBox: { width: 72, justifyContent: 'center', paddingLeft: 8 },
  barHeader: { width: 130, alignItems: 'center', paddingVertical: 6, borderLeftWidth: 1, borderLeftColor: C.border, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  barHeaderText: { color: C.secondary, fontSize: 11, fontWeight: 'bold', fontFamily: 'Georgia' },
  barPlayBtn: { backgroundColor: C.crimson, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  barPlayBtnText: { color: C.offWhite, fontSize: 10, fontWeight: 'bold' },
  voiceRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: C.border },
  voiceLabel: { color: C.secondary, fontWeight: 'bold', fontSize: 10, paddingTop: 10, letterSpacing: 1, fontFamily: 'Georgia' },
  barCell: { width: 130, minHeight: 72, padding: 6, borderLeftWidth: 1, borderLeftColor: C.border, justifyContent: 'space-between' },
  barCopyBtn: { alignSelf: 'flex-end', paddingHorizontal: 4, paddingVertical: 2 },
  barCopyBtnText: { fontSize: 12 },
  barCellActive: { backgroundColor: 'rgba(74,94,42,0.25)', borderLeftColor: C.secondary, borderLeftWidth: 2 },
  barCellNotes: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, flex: 1, alignItems: 'center' },
  emptyBarText: { color: '#2a3a1a', fontSize: 11, fontStyle: 'italic' },
  noteChip: { backgroundColor: '#1a2a0d', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: C.border },
  noteChipText: { color: C.offWhite, fontSize: 12, fontWeight: 'bold', fontFamily: 'Georgia' },
  cursor: { color: C.secondary, fontSize: 18, fontWeight: 'bold', marginLeft: 1 },
  beatCounter: { fontSize: 10, fontWeight: 'bold', marginTop: 4 },
  barControlsRow: { flexDirection: 'row', width: '100%', marginTop: 14, gap: 10 },
  outlineBtn: { flex: 1, borderWidth: 1, borderColor: C.crimson, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  outlineBtnText: { color: C.secondary, fontWeight: 'bold', fontFamily: 'Georgia' },
  scanBtn: { width: '100%', marginTop: 20, borderWidth: 1, borderColor: C.secondary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderStyle: 'dashed' },
  scanBtnText: { color: C.secondary, fontWeight: 'bold', fontSize: 15, fontFamily: 'Georgia' },
  scanBtnSub: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  playBtn: { marginTop: 16, width: '100%', backgroundColor: C.crimson, paddingVertical: 18, borderRadius: 16, alignItems: 'center', borderWidth: 1, borderColor: C.secondary },
  playBtnDisabled: { opacity: 0.6 },
  playBtnText: { color: C.offWhite, fontSize: 18, fontWeight: 'bold', letterSpacing: 2, fontFamily: 'Georgia' },
  statusText: { marginTop: 14, fontSize: 14, textAlign: 'center', fontWeight: 'bold', fontFamily: 'Georgia' },
  keyboard: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#0a0f06', borderTopWidth: 2, borderTopColor: C.secondary, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 16 },
  kbStatusBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.input, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 4, borderWidth: 1, borderColor: C.border },
  kbStatusText: { color: C.offWhite, fontSize: 11, fontWeight: 'bold', flex: 1 },
  kbClose: { color: C.textSecondary, fontSize: 18, fontWeight: 'bold', paddingLeft: 8 },
  overflowWarning: { color: C.warning, fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 4, backgroundColor: '#2a1a00', borderRadius: 6, padding: 4 },
  keyError: { color: C.error, fontSize: 11, fontWeight: 'bold', textAlign: 'center', marginBottom: 4, backgroundColor: '#2a0010', borderRadius: 6, padding: 4 },
  barInputRow: { flexDirection: 'row', gap: 8, marginBottom: 6, alignItems: 'center' },
  barInput: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.secondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.offWhite, fontSize: 14, fontFamily: 'Georgia' },
  barInputBtn: { backgroundColor: C.crimson, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.secondary },
  barInputBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 13 },
  navRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  navBtn: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
  navBtnText: { color: C.secondary, fontWeight: 'bold', fontSize: 10 },
  kbSectionLabel: { color: C.textSecondary, fontSize: 9, fontWeight: 'bold', letterSpacing: 1, marginTop: 5, marginBottom: 3 },
  noteRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 4, marginBottom: 2 },
  noteBtn: { flex: 1, backgroundColor: C.crimson, borderRadius: 8, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  noteBtnChromatic: { backgroundColor: '#3a4a1a' },
  noteBtnSelected: { backgroundColor: '#2a3a10', borderWidth: 2, borderColor: C.secondary },
  noteBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 14, fontFamily: 'Georgia' },
  chromaticToggle: { backgroundColor: C.input, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: C.border, marginTop: 4, marginBottom: 2, alignItems: 'center' },
  chromaticToggleText: { color: C.secondary, fontSize: 11, fontWeight: 'bold' },
  octaveRow: { flexDirection: 'row', gap: 8 },
  octaveBtn: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.crimson, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  octaveBtnSelected: { backgroundColor: C.crimson, borderColor: C.secondary },
  octaveBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 12 },
  durationRow: { flexDirection: 'row', gap: 4 },
  durationBtn: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 5, alignItems: 'center' },
  durationBtnDisabled: { opacity: 0.3 },
  durationBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 13 },
  durationBtnLabel: { color: C.secondary, fontSize: 9, marginTop: 1 },
  durationBtnSub: { color: C.textSecondary, fontSize: 8 },
  extrasRow: { flexDirection: 'row', gap: 6, marginTop: 2 },
  extraBtn: { flex: 1, backgroundColor: C.input, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  extraBtnText: { color: C.offWhite, fontWeight: 'bold', fontSize: 12 },
  extraBtnSub: { color: C.textSecondary, fontSize: 9, marginTop: 2 },
});