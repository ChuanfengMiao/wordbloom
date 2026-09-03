'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  Download,
  HelpCircle,
  Info,
  Leaf,
  NotebookPen,
  PanelTopClose,
  RotateCcw,
  Settings2,
  Sprout,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import lemmasData from '../data/lemmas.json';
import manifest from '../data/manifest.json';
import legacyV1Map from '../data/legacy-v1-map.json';
import {
  countStatuses,
  countNotes,
  createBackup,
  type DatasetMigration,
  findNextUnmarked,
  LEGACY_STORAGE_KEY,
  MAX_NOTE_LENGTH,
  migrateStoredProgress,
  normalizeNote,
  NOTES_STORAGE_KEY,
  parseBackup,
  parseStoredNotes,
  parseStoredProgress,
  serializeNotes,
  serializeProgress,
  STORAGE_KEY,
  statusForSwipe,
  type WordNotes,
  type WordStatus,
} from '../lib/progress';
import {
  configureAmericanUtterance,
  type PronunciationStatus,
} from '../lib/speech';
import { Overview, type WordEntry } from './Overview';
import { createDecisionSounds } from '../lib/decision-sounds';

const WORDS: WordEntry[] = (lemmasData as string[]).map((lemma, id) => ({ id, lemma, rank: id + 1 }));
const LEGACY_MIGRATION = legacyV1Map as DatasetMigration;
type View = 'cards' | 'overview';
type Modal = 'progress' | 'import' | 'reset' | null;
type UndoState = { index: number; previousStatus: WordStatus; previousCursor: number } | null;
type NoteSaveState = 'saved' | 'saving' | 'error';

function isEditableTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (element.tagName === 'INPUT' ||
        element.tagName === 'TEXTAREA' ||
        element.tagName === 'SELECT' ||
        element.isContentEditable),
  );
}

function stateLabel(status: WordStatus) {
  if (status === 1) return 'Known';
  if (status === 2) return 'Unknown';
  return 'Unmarked';
}

export function WordBloomApp() {
  const [view, setView] = useState<View>('cards');
  const [statuses, setStatuses] = useState<Uint8Array>(() => new Uint8Array(WORDS.length));
  const [cursor, setCursor] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [undoState, setUndoState] = useState<UndoState>(null);
  const [notes, setNotes] = useState<WordNotes>({});
  const [noteSaveState, setNoteSaveState] = useState<NoteSaveState>('saved');
  const [flipped, setFlipped] = useState(false);
  const [speechStatus, setSpeechStatus] = useState<PronunciationStatus>('unsupported');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [announcement, setAnnouncement] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [pendingImport, setPendingImport] = useState<{
    statuses: Uint8Array;
    cursor: number;
    migrated: boolean;
    notes: WordNotes;
  } | null>(null);
  const [importError, setImportError] = useState('');
  const [animating, setAnimating] = useState(false);
  const cardStageRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLElement>(null);
  const noteInputRef = useRef<HTMLTextAreaElement>(null);
  const focusCurrentCardRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const latestState = useRef({ statuses, cursor });
  const latestNotes = useRef<WordNotes>(notes);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const decisionSoundsRef = useRef<ReturnType<typeof createDecisionSounds> | null>(null);
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 0, 240], [-7, 0, 7]);
  const knownHintOpacity = useTransform(x, [-170, -35, 0], [1, 0.15, 0]);
  const unknownHintOpacity = useTransform(x, [0, 35, 170], [0, 0.15, 1]);

  const stats = useMemo(() => countStatuses(statuses), [statuses]);
  const currentWord = cursor < WORDS.length ? WORDS[cursor] : null;
  const currentStatus = currentWord ? (statuses[currentWord.id] as WordStatus) : 0;
  const progressPercent = (stats.reviewed / WORDS.length) * 100;
  const pendingStats = pendingImport ? countStatuses(pendingImport.statuses) : null;
  const pendingNoteCount = pendingImport ? countNotes(pendingImport.notes) : 0;
  const modalOpen = modal !== null;
  const currentNote = currentWord ? notes[currentWord.id] ?? '' : '';

  const persistNotes = useCallback((nextNotes: WordNotes = latestNotes.current) => {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(serializeNotes(nextNotes, WORDS.length)));
      setNoteSaveState('saved');
      return true;
    } catch {
      setNoteSaveState('error');
      setAnnouncement('Your note is still available here, but it could not be saved on this device. Export a backup to preserve it.');
      return false;
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      let attemptedKey = STORAGE_KEY;
      const messages: string[] = [];
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const restored = parseStoredProgress(raw, WORDS.length);
          const restoredCursor =
            restored.cursor < WORDS.length && restored.statuses[restored.cursor] === 0
              ? restored.cursor
              : findNextUnmarked(restored.statuses, Math.max(-1, restored.cursor - 1));
          latestState.current = { statuses: restored.statuses, cursor: restoredCursor };
          setStatuses(restored.statuses);
          setCursor(restoredCursor);
        } else {
          attemptedKey = LEGACY_STORAGE_KEY;
          const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacyRaw) {
            const restored = migrateStoredProgress(legacyRaw, LEGACY_MIGRATION, WORDS.length);
            latestState.current = { statuses: restored.statuses, cursor: restored.cursor };
            setStatuses(restored.statuses);
            setCursor(restored.cursor);
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify(serializeProgress(restored.statuses, restored.cursor)),
            );
            messages.push(
              `Your saved progress was updated for the corrected word list. ${restored.retained.toLocaleString()} classifications were retained.`,
            );
          }
        }
      } catch {
        localStorage.removeItem(attemptedKey);
        messages.push('Saved progress could not be read, so a fresh local inventory was started.');
      }
      try {
        const rawNotes = localStorage.getItem(NOTES_STORAGE_KEY);
        if (rawNotes) {
          const restoredNotes = parseStoredNotes(rawNotes, WORDS.length);
          latestNotes.current = restoredNotes;
          setNotes(restoredNotes);
        }
      } catch {
        localStorage.removeItem(NOTES_STORAGE_KEY);
        messages.push('Saved notes could not be read and were cleared.');
      }
      if (messages.length > 0) setAnnouncement(messages.join(' '));
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    latestState.current = { statuses, cursor };
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(statuses, cursor)));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [cursor, hydrated, statuses]);

  useEffect(() => {
    latestNotes.current = notes;
    if (!hydrated) return;
    const timeout = window.setTimeout(() => persistNotes(notes), 300);
    return () => window.clearTimeout(timeout);
  }, [hydrated, notes, persistNotes]);

  useEffect(() => {
    const persist = () => {
      if (document.visibilityState === 'hidden') {
        const latest = latestState.current;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(latest.statuses, latest.cursor)));
        persistNotes(latestNotes.current);
      }
    };
    document.addEventListener('visibilitychange', persist);
    return () => document.removeEventListener('visibilitychange', persist);
  }, [persistNotes]);

  useEffect(() => () => {
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(serializeNotes(latestNotes.current, WORDS.length)));
    } catch {
      // The in-memory draft remains exportable until the page fully closes.
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
      return;
    }
    const synth = window.speechSynthesis;
    const refreshVoices = () => setVoices(synth.getVoices());
    const frame = window.requestAnimationFrame(() => {
      setSpeechSupported(true);
      setSpeechStatus('idle');
      refreshVoices();
    });
    synth.addEventListener('voiceschanged', refreshVoices);
    return () => {
      window.cancelAnimationFrame(frame);
      synth.removeEventListener('voiceschanged', refreshVoices);
      synth.cancel();
      utteranceRef.current = null;
    };
  }, []);

  useEffect(() => {
    x.set(0);
  }, [cursor, view, x]);

  useEffect(() => {
    if (view !== 'cards' || !focusCurrentCardRef.current) return;
    focusCurrentCardRef.current = false;
    const frame = window.requestAnimationFrame(() => currentCardRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [cursor, view]);

  useEffect(() => {
    if (!modalOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleDialogKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setModal(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKey);
    return () => {
      document.removeEventListener('keydown', handleDialogKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modal) return;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const initial = dialog?.querySelector<HTMLElement>('[data-modal-initial-focus]');
      (initial ?? dialog)?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [modal]);

  const cancelSpeech = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    setSpeechStatus(speechSupported ? 'idle' : 'unsupported');
  }, [speechSupported]);

  const speakCurrent = useCallback(() => {
    if (!currentWord) return;
    decisionSoundsRef.current?.stop();
    if (!speechSupported || typeof SpeechSynthesisUtterance === 'undefined') {
      setSpeechStatus('unsupported');
      setAnnouncement('American English pronunciation is not available in this browser.');
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = configureAmericanUtterance(
      new SpeechSynthesisUtterance(currentWord.lemma),
      voices.length > 0 ? voices : synth.getVoices(),
    );
    utteranceRef.current = utterance;
    utterance.onstart = () => {
      if (utteranceRef.current === utterance) setSpeechStatus('speaking');
    };
    utterance.onend = () => {
      if (utteranceRef.current === utterance) {
        utteranceRef.current = null;
        setSpeechStatus('idle');
      }
    };
    utterance.onerror = (event) => {
      if (utteranceRef.current !== utterance) return;
      utteranceRef.current = null;
      if (event.error === 'canceled' || event.error === 'interrupted') {
        setSpeechStatus('idle');
        return;
      }
      setSpeechStatus('error');
      setAnnouncement(`Pronunciation for ${currentWord.lemma} could not be played.`);
    };
    synth.speak(utterance);
  }, [currentWord, speechSupported, voices]);

  const openNotes = useCallback(() => {
    if (!currentWord || flipped) return;
    setFlipped(true);
    setAnnouncement(`Notes opened for ${currentWord.lemma}.`);
  }, [currentWord, flipped]);

  const closeNotes = useCallback(() => {
    if (!currentWord || !flipped) return;
    persistNotes();
    setFlipped(false);
    setAnnouncement(`Notes closed for ${currentWord.lemma}.`);
    window.requestAnimationFrame(() => currentCardRef.current?.focus());
  }, [currentWord, flipped, persistNotes]);

  useEffect(() => {
    if (!flipped) return;
    const frame = window.requestAnimationFrame(() => noteInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [flipped]);

  useEffect(() => {
    if (modal || view !== 'cards') decisionSoundsRef.current?.stop();
    if (speechSupported) window.speechSynthesis.cancel();
    utteranceRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      setSpeechStatus(speechSupported ? 'idle' : 'unsupported');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [cursor, modal, speechSupported, view]);

  useEffect(() => () => {
    decisionSoundsRef.current?.dispose();
    decisionSoundsRef.current = null;
  }, []);

  const updateCurrentNote = (value: string) => {
    if (!currentWord) return;
    const nextNotes = { ...latestNotes.current };
    if (value.length === 0) delete nextNotes[currentWord.id];
    else nextNotes[currentWord.id] = value;
    latestNotes.current = nextNotes;
    setNotes(nextNotes);
    setNoteSaveState('saving');
  };

  const classify = useCallback(
    (status: WordStatus) => {
      if (!currentWord || (status !== 1 && status !== 2)) return;
      persistNotes();
      const nextStatuses = statuses.slice();
      const previousStatus = nextStatuses[currentWord.id] as WordStatus;
      nextStatuses[currentWord.id] = status;
      const nextCursor = findNextUnmarked(nextStatuses, currentWord.id);
      setUndoState({ index: currentWord.id, previousStatus, previousCursor: cursor });
      latestState.current = { statuses: nextStatuses, cursor: nextCursor };
      setStatuses(nextStatuses);
      setCursor(nextCursor);
      setFlipped(false);
      setAnnouncement(
        `${currentWord.lemma} marked ${stateLabel(status).toLowerCase()}. ${
          nextCursor < WORDS.length ? `Next word: ${WORDS[nextCursor].lemma}.` : 'All words are classified.'
        }`,
      );
    },
    [currentWord, cursor, persistNotes, statuses],
  );

  const commitWithMotion = useCallback(
    (status: WordStatus) => {
      if (!hydrated || animating || !currentWord || (status !== 1 && status !== 2)) return;
      cancelSpeech();
      decisionSoundsRef.current ??= createDecisionSounds();
      void decisionSoundsRef.current.play(status);
      const direction = status === 1 ? -1 : 1;
      if (reduceMotion) {
        classify(status);
        return;
      }
      setAnimating(true);
      const distance = Math.max(window.innerWidth, 760) * direction;
      animate(x, distance, { duration: 0.22, ease: 'easeIn' }).then(() => {
        classify(status);
        x.set(0);
        setAnimating(false);
      });
    },
    [animating, cancelSpeech, classify, currentWord, hydrated, reduceMotion, x],
  );

  const undo = useCallback(() => {
    if (!undoState || animating) return;
    decisionSoundsRef.current?.stop();
    const nextStatuses = statuses.slice();
    nextStatuses[undoState.index] = undoState.previousStatus;
    latestState.current = { statuses: nextStatuses, cursor: undoState.previousCursor };
    setStatuses(nextStatuses);
    setCursor(undoState.previousCursor);
    setFlipped(false);
    setAnnouncement(`${WORDS[undoState.index].lemma} restored to ${stateLabel(undoState.previousStatus).toLowerCase()}.`);
    setUndoState(null);
  }, [animating, statuses, undoState]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (modal || view !== 'cards' || event.isComposing) return;
      const modified = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
      const editable = isEditableTarget(event.target);
      // Vertical shortcuts intentionally work in this editor; modified arrows still edit text.
      if (!modified && (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
          (!editable || (flipped && event.target === noteInputRef.current))) {
        event.preventDefault();
        if (event.repeat || animating) return;
        if (event.key === 'ArrowUp') speakCurrent();
        else if (flipped) closeNotes();
        else openNotes();
        return;
      }
      if (editable || flipped) return;
      if (!modified && event.key === 'ArrowLeft') {
        event.preventDefault();
        commitWithMotion(1);
      } else if (!modified && event.key === 'ArrowRight') {
        event.preventDefault();
        commitWithMotion(2);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [animating, closeNotes, commitWithMotion, flipped, modal, openNotes, speakCurrent, undo, view]);

  const openWord = (index: number) => {
    persistNotes();
    focusCurrentCardRef.current = true;
    setFlipped(false);
    setCursor(index);
    setView('cards');
    setAnnouncement(`${WORDS[index].lemma} opened for review.`);
  };

  const changeView = (nextView: View) => {
    persistNotes();
    setFlipped(false);
    setView(nextView);
  };

  const exportProgress = () => {
    persistNotes();
    const backup = createBackup(statuses, cursor, latestNotes.current);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wordbloom-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setAnnouncement('Progress and notes backup downloaded.');
  };

  const handleImport = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text(), WORDS.length, LEGACY_MIGRATION);
      setPendingImport(parsed);
      setImportError('');
      setModal('import');
    } catch (error) {
      setPendingImport(null);
      setImportError(error instanceof Error ? error.message : 'The backup could not be read.');
      setModal('import');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  };

  const confirmImport = () => {
    if (!pendingImport) return;
    const importedCursor =
      pendingImport.cursor < WORDS.length && pendingImport.statuses[pendingImport.cursor] === 0
        ? pendingImport.cursor
        : findNextUnmarked(pendingImport.statuses, Math.max(-1, pendingImport.cursor - 1));
    latestState.current = { statuses: pendingImport.statuses, cursor: importedCursor };
    latestNotes.current = pendingImport.notes;
    setStatuses(pendingImport.statuses);
    setCursor(importedCursor);
    setNotes(pendingImport.notes);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(serializeProgress(pendingImport.statuses, importedCursor)),
    );
    const notesSaved = persistNotes(pendingImport.notes);
    setUndoState(null);
    setFlipped(false);
    setPendingImport(null);
    setModal(null);
    if (notesSaved) {
      setAnnouncement(
        pendingImport.migrated
          ? 'Older backup imported and updated for the corrected word list. Your local progress and notes have been replaced.'
          : 'Backup imported. Your local progress and notes have been replaced.',
      );
    }
  };

  const confirmReset = () => {
    const empty = new Uint8Array(WORDS.length);
    latestState.current = { statuses: empty, cursor: 0 };
    latestNotes.current = {};
    setStatuses(empty);
    setCursor(0);
    setNotes({});
    setUndoState(null);
    setFlipped(false);
    cancelSpeech();
    decisionSoundsRef.current?.stop();
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(NOTES_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(empty, 0)));
    setModal(null);
    setAnnouncement('All progress and notes reset. Starting again with the first word.');
  };

  const stackIndexes = currentWord
    ? [cursor + 2, cursor + 1, cursor].filter((index) => index < WORDS.length)
    : [];

  return (
    <main className={`app-shell view-${view}`} aria-busy={!hydrated}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="ambient flower-dots" />

      <header className="topbar">
        <button className="brand" type="button" onClick={() => changeView('cards')} aria-label="Open WordBloom cards">
          <span className="brand-mark" aria-hidden="true">✿</span>
          <span>WordBloom</span>
        </button>
        <nav className="view-switch" aria-label="Vocabulary views">
          <button className={`view-pill ${view === 'cards' ? 'active' : ''}`} type="button" onClick={() => changeView('cards')}>
            Cards
          </button>
          <button className={`view-pill ${view === 'overview' ? 'active' : ''}`} type="button" onClick={() => changeView('overview')}>
            Overview
          </button>
        </nav>
        <button
          aria-label="Open progress and backup"
          className="quiet-button progress-menu-button"
          type="button"
          onClick={() => setModal('progress')}
        >
          <Settings2 aria-hidden="true" size={17} />
          <span className="progress-label">Progress</span>
        </button>
      </header>

      <section className="summary-strip" aria-label="Vocabulary progress summary">
        <div><span className="metric-dot reviewed-dot" /><strong>{stats.reviewed.toLocaleString()}</strong><small>Reviewed</small></div>
        <div><span className="metric-dot known-dot" /><strong>{stats.known.toLocaleString()}</strong><small>Known</small></div>
        <div><span className="metric-dot unknown-dot" /><strong>{stats.unknown.toLocaleString()}</strong><small>Unknown</small></div>
        <div><span className="metric-dot remaining-dot" /><strong>{stats.remaining.toLocaleString()}</strong><small>Remaining</small></div>
      </section>

      {view === 'overview' ? (
        <Overview words={WORDS} statuses={statuses} onOpenWord={openWord} />
      ) : (
        <section className="workspace">
          <div className="progress-copy">
            <p className="eyebrow">YOUR VOCABULARY GARDEN</p>
            <div className="progress-heading">
              <div>
                <h1>{stats.remaining === 0 ? 'Your map is complete.' : 'One word at a time.'}</h1>
                <p>{stats.remaining === 0 ? 'You can revisit any word from the overview.' : 'Be honest, go gently. There’s no wrong answer here.'}</p>
              </div>
              <p className="progress-number"><strong>{stats.reviewed.toLocaleString()}</strong> / 20,000</p>
            </div>
            <div className="progress-track" aria-label={`${stats.reviewed} of 20,000 words reviewed`}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {currentWord ? (
            <>
              <div className="card-stage" ref={cardStageRef}>
                <motion.div className="swipe-hint known-swipe-hint" style={{ opacity: knownHintOpacity }} aria-hidden="true">
                  <Check size={22} /> Known
                </motion.div>
                <motion.div className="swipe-hint unknown-swipe-hint" style={{ opacity: unknownHintOpacity }} aria-hidden="true">
                  Unknown <HelpCircle size={22} />
                </motion.div>
                {stackIndexes.map((wordIndex) => {
                  const depth = cursor - wordIndex;
                  const isCurrent = wordIndex === cursor;
                  const status = statuses[wordIndex] as WordStatus;
                  if (!isCurrent) {
                    return (
                      <article
                        aria-hidden="true"
                        className={`word-card card-back depth-${Math.abs(depth)} status-${status}`}
                        key={wordIndex}
                      />
                    );
                  }
                  return (
                    <motion.article
                      ref={currentCardRef}
                      className={`word-card current-card status-${status} ${flipped ? 'is-flipped' : ''}`}
                      drag={flipped ? false : 'x'}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={1}
                      key={wordIndex}
                      style={{ x, rotate }}
                      onDragEnd={(_, info) => {
                        const width = cardStageRef.current?.clientWidth ?? 520;
                        const swipeStatus = statusForSwipe(info.offset.x, info.velocity.x, width);
                        if (swipeStatus) {
                          commitWithMotion(swipeStatus);
                        } else {
                          animate(x, 0, { type: 'spring', stiffness: 420, damping: 32 });
                        }
                      }}
                      aria-label={`${currentWord.lemma}, rank ${currentWord.rank}, ${stateLabel(currentStatus)}, ${flipped ? 'notes side' : 'front side'}`}
                      tabIndex={-1}
                    >
                      <motion.div
                        className={`card-flipper ${reduceMotion ? 'reduced-flip' : ''}`}
                        initial={false}
                        animate={reduceMotion ? { opacity: 1 } : { rotateY: flipped ? 180 : 0 }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.36 }}
                      >
                        <section
                          className="card-face card-front-face"
                          aria-hidden={flipped}
                          inert={flipped ? true : undefined}
                        >
                          <div className="card-topline">
                            <span className="rank-chip">#{currentWord.rank.toLocaleString()}</span>
                            <span className={`card-state-badge status-${currentStatus}`}>
                              {currentStatus === 1 && <Check aria-hidden="true" size={13} />}
                              {currentStatus === 2 && <HelpCircle aria-hidden="true" size={13} />}
                              {stateLabel(currentStatus)}
                            </span>
                          </div>
                          <div className="word-center">
                            <p className="question">Know this word?</p>
                            <h2>{currentWord.lemma}</h2>
                            <p className="known-rule">You can recall a meaning and recognize it in context.</p>
                          </div>
                          <div className="card-footer">
                            <p className="drag-hint">Drag or use the arrow keys</p>
                            <div className="card-tools" aria-label="Word tools">
                              <button
                                className={`card-tool ${speechStatus === 'speaking' ? 'speaking' : ''}`}
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={speakCurrent}
                                disabled={!speechSupported}
                                aria-label={`${speechStatus === 'speaking' ? 'Replay' : 'Play'} American pronunciation of ${currentWord.lemma}`}
                                aria-keyshortcuts="ArrowUp"
                              >
                                <Volume2 aria-hidden="true" size={17} />
                                <span>Listen</span>
                                <kbd>↑</kbd>
                              </button>
                              <button
                                className="card-tool"
                                type="button"
                                onPointerDown={(event) => event.stopPropagation()}
                                onClick={openNotes}
                                aria-label={`Open notes for ${currentWord.lemma}`}
                                aria-keyshortcuts="ArrowDown"
                              >
                                <NotebookPen aria-hidden="true" size={17} />
                                <span>Notes</span>
                                <kbd>↓</kbd>
                              </button>
                            </div>
                          </div>
                        </section>

                        <section
                          className="card-face note-card-face"
                          aria-hidden={!flipped}
                          inert={flipped ? undefined : true}
                        >
                          <div className="note-card-topline">
                            <div>
                              <span className="rank-chip">#{currentWord.rank.toLocaleString()}</span>
                              <p>Notes for <strong>{currentWord.lemma}</strong></p>
                            </div>
                            <div className="note-card-actions">
                              <button
                                className={`card-tool ${speechStatus === 'speaking' ? 'speaking' : ''}`}
                                type="button"
                                onClick={speakCurrent}
                                disabled={!speechSupported}
                                aria-label={`${speechStatus === 'speaking' ? 'Replay' : 'Play'} American pronunciation of ${currentWord.lemma}`}
                                aria-keyshortcuts="ArrowUp"
                              >
                                <Volume2 aria-hidden="true" size={18} />
                                <span>Listen</span> <kbd>↑</kbd>
                              </button>
                              <button
                                className="show-front-button"
                                type="button"
                                onClick={closeNotes}
                                aria-label={`Show the front of ${currentWord.lemma}`}
                                aria-keyshortcuts="ArrowDown"
                              >
                                <PanelTopClose aria-hidden="true" size={17} />
                                <span>Show front</span> <kbd>↓</kbd>
                              </button>
                            </div>
                          </div>
                          <label className="note-label" htmlFor={`word-note-${currentWord.id}`}>Your note</label>
                          <textarea
                            id={`word-note-${currentWord.id}`}
                            ref={noteInputRef}
                            className="note-editor"
                            value={currentNote}
                            maxLength={MAX_NOTE_LENGTH}
                            onChange={(event) => updateCurrentNote(event.target.value)}
                            onBlur={() => {
                              const normalized = normalizeNote(currentNote);
                              if (normalized !== currentNote) updateCurrentNote(normalized);
                              persistNotes();
                            }}
                            aria-describedby={`note-shortcuts-${currentWord.id} note-meta-${currentWord.id}`}
                            placeholder="Add a memory cue, meaning, or example…"
                          />
                          <p className="sr-only" id={`note-shortcuts-${currentWord.id}`}>
                            Up Arrow plays pronunciation. Down Arrow shows the front. Use modified arrows to move or select text vertically.
                          </p>
                          <div className="note-meta" id={`note-meta-${currentWord.id}`}>
                            <span className={`note-save-state ${noteSaveState}`}>
                              {noteSaveState === 'error' ? 'Not saved' : noteSaveState === 'saving' ? 'Saving…' : 'Saved locally'}
                            </span>
                            <span>{currentNote.length.toLocaleString()} / {MAX_NOTE_LENGTH.toLocaleString()}</span>
                          </div>
                        </section>
                      </motion.div>
                    </motion.article>
                  );
                })}
              </div>

              <div className="decision-row">
                <button className="decision known" type="button" onClick={() => commitWithMotion(1)} disabled={!hydrated || animating}>
                  <span className="keycap"><ChevronLeft aria-hidden="true" size={19} /></span>
                  <span><small>I know it</small>Known</span>
                </button>
                <button className="decision unknown" type="button" onClick={() => commitWithMotion(2)} disabled={!hydrated || animating}>
                  <span><small>Not yet</small>Unknown</span>
                  <span className="keycap"><ChevronRight aria-hidden="true" size={19} /></span>
                </button>
              </div>
            </>
          ) : (
            <section className="completion-card">
              <span className="completion-flower" aria-hidden="true">✿</span>
              <p className="eyebrow">20,000 WORDS REVIEWED</p>
              <h2>Your vocabulary garden is mapped.</h2>
              <p>You marked {stats.known.toLocaleString()} known words and {stats.unknown.toLocaleString()} words to revisit.</p>
              <button type="button" onClick={() => changeView('overview')}><Leaf aria-hidden="true" size={18} /> Explore your overview</button>
            </section>
          )}

          <div className="below-actions">
            <button className="undo-button" type="button" onClick={undo} disabled={!undoState || animating}>
              <RotateCcw aria-hidden="true" size={15} /> Undo <span>Ctrl Z</span>
            </button>
            <p className="gentle-note"><Sprout aria-hidden="true" size={14} /> Your progress and notes stay on this device.</p>
          </div>
        </section>
      )}

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</div>

      <input
        className="sr-only"
        ref={importRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => handleImport(event.target.files?.[0])}
        tabIndex={-1}
      />

      {modal && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setModal(null)}>
          <section
            className="modal-card"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            tabIndex={-1}
          >
            <button
              className="modal-close"
              type="button"
              onClick={() => setModal(null)}
              aria-label="Close dialog"
              data-modal-initial-focus
            ><X aria-hidden="true" size={19} /></button>

            {modal === 'progress' && (
              <>
                <div className="modal-icon lavender"><Sprout aria-hidden="true" size={22} /></div>
                <p className="eyebrow">YOUR LOCAL DATA</p>
                <h2 id="modal-title">Progress & backup</h2>
                <p className="modal-lede">Everything stays in this browser unless you choose to export it.</p>
                <div className="modal-stats">
                  <div><strong>{stats.known.toLocaleString()}</strong><span>Known</span></div>
                  <div><strong>{stats.unknown.toLocaleString()}</strong><span>Unknown</span></div>
                  <div><strong>{stats.remaining.toLocaleString()}</strong><span>Remaining</span></div>
                </div>
                <p className="modal-note-count"><NotebookPen aria-hidden="true" size={15} /> {countNotes(notes).toLocaleString()} saved notes</p>
                <div className="modal-actions">
                  <button type="button" className="primary-action" onClick={exportProgress}><Download size={17} /> Export backup</button>
                  <button type="button" className="secondary-action" onClick={() => importRef.current?.click()}><Upload size={17} /> Import backup</button>
                  <button type="button" className="danger-action" onClick={() => setModal('reset')}><RotateCcw size={17} /> Reset all</button>
                </div>
                <div className="source-note">
                  <Database aria-hidden="true" size={17} />
                  <p><strong>{manifest.entryCount.toLocaleString()} ranked lemmas</strong><span>Open English WordNet 2025 + wordfreq 3.1.1</span></p>
                  <a href="https://en-word.net/downloads" target="_blank" rel="noreferrer" aria-label="Read data source information"><Info size={16} /></a>
                </div>
              </>
            )}

            {modal === 'import' && (
              <>
                <div className={`modal-icon ${importError ? 'pink' : 'green'}`}>
                  {importError ? <HelpCircle aria-hidden="true" size={22} /> : <Upload aria-hidden="true" size={22} />}
                </div>
                <p className="eyebrow">IMPORT BACKUP</p>
                <h2 id="modal-title">{importError ? 'That file didn’t work' : 'Replace local data?'}</h2>
                {importError ? (
                  <>
                    <p className="modal-lede error-copy">{importError}</p>
                    <button className="primary-action full-action" type="button" onClick={() => importRef.current?.click()}>Choose another file</button>
                  </>
                ) : (
                  <>
                    <p className="modal-lede">This will replace the progress and notes currently saved in this browser.</p>
                    <div className="modal-stats">
                      <div><strong>{pendingStats?.known.toLocaleString()}</strong><span>Known</span></div>
                      <div><strong>{pendingStats?.unknown.toLocaleString()}</strong><span>Unknown</span></div>
                      <div><strong>{pendingStats?.remaining.toLocaleString()}</strong><span>Remaining</span></div>
                    </div>
                    <p className="modal-note-count"><NotebookPen aria-hidden="true" size={15} /> {pendingNoteCount.toLocaleString()} notes in this backup</p>
                    <div className="confirm-row">
                      <button type="button" className="secondary-action" onClick={() => setModal(null)}>Cancel</button>
                      <button type="button" className="primary-action" onClick={confirmImport}>Replace progress</button>
                    </div>
                  </>
                )}
              </>
            )}

            {modal === 'reset' && (
              <>
                <div className="modal-icon pink"><RotateCcw aria-hidden="true" size={22} /></div>
                <p className="eyebrow">FRESH START</p>
                <h2 id="modal-title">Reset all local data?</h2>
                <p className="modal-lede">All {stats.reviewed.toLocaleString()} decisions and {countNotes(notes).toLocaleString()} notes on this device will be removed. Export a backup first if you may want them later.</p>
                <div className="confirm-row">
                  <button type="button" className="secondary-action" onClick={() => setModal('progress')}>Keep progress</button>
                  <button type="button" className="danger-action filled" onClick={confirmReset}>Reset everything</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
