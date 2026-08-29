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
  RotateCcw,
  Settings2,
  Sprout,
  Upload,
  X,
} from 'lucide-react';
import lemmasData from '../data/lemmas.json';
import manifest from '../data/manifest.json';
import legacyV1Map from '../data/legacy-v1-map.json';
import {
  countStatuses,
  createBackup,
  type DatasetMigration,
  findNextUnmarked,
  LEGACY_STORAGE_KEY,
  migrateStoredProgress,
  parseBackup,
  parseStoredProgress,
  serializeProgress,
  STORAGE_KEY,
  statusForSwipe,
  type WordStatus,
} from '../lib/progress';
import { Overview, type WordEntry } from './Overview';

const WORDS: WordEntry[] = (lemmasData as string[]).map((lemma, id) => ({ id, lemma, rank: id + 1 }));
const LEGACY_MIGRATION = legacyV1Map as DatasetMigration;
type View = 'cards' | 'overview';
type Modal = 'progress' | 'import' | 'reset' | null;
type UndoState = { index: number; previousStatus: WordStatus; previousCursor: number } | null;

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
  const [announcement, setAnnouncement] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [pendingImport, setPendingImport] = useState<{
    statuses: Uint8Array;
    cursor: number;
    migrated: boolean;
  } | null>(null);
  const [importError, setImportError] = useState('');
  const [animating, setAnimating] = useState(false);
  const cardStageRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLElement>(null);
  const focusCurrentCardRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const latestState = useRef({ statuses, cursor });
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
  const modalOpen = modal !== null;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      let attemptedKey = STORAGE_KEY;
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
            setAnnouncement(
              `Your saved progress was updated for the corrected word list. ${restored.retained.toLocaleString()} classifications were retained.`,
            );
          }
        }
      } catch {
        localStorage.removeItem(attemptedKey);
        setAnnouncement('Saved progress could not be read, so a fresh local inventory was started.');
      } finally {
        setHydrated(true);
      }
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
    const persist = () => {
      if (document.visibilityState === 'hidden') {
        const latest = latestState.current;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(latest.statuses, latest.cursor)));
      }
    };
    document.addEventListener('visibilitychange', persist);
    return () => document.removeEventListener('visibilitychange', persist);
  }, []);

  useEffect(() => {
    x.set(0);
  }, [cursor, x]);

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

  const classify = useCallback(
    (status: WordStatus) => {
      if (!currentWord || (status !== 1 && status !== 2)) return;
      const nextStatuses = statuses.slice();
      const previousStatus = nextStatuses[currentWord.id] as WordStatus;
      nextStatuses[currentWord.id] = status;
      const nextCursor = findNextUnmarked(nextStatuses, currentWord.id);
      setUndoState({ index: currentWord.id, previousStatus, previousCursor: cursor });
      latestState.current = { statuses: nextStatuses, cursor: nextCursor };
      setStatuses(nextStatuses);
      setCursor(nextCursor);
      setAnnouncement(
        `${currentWord.lemma} marked ${stateLabel(status).toLowerCase()}. ${
          nextCursor < WORDS.length ? `Next word: ${WORDS[nextCursor].lemma}.` : 'All words are classified.'
        }`,
      );
    },
    [currentWord, cursor, statuses],
  );

  const commitWithMotion = useCallback(
    (status: WordStatus) => {
      if (!hydrated || animating || !currentWord) return;
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
    [animating, classify, currentWord, hydrated, reduceMotion, x],
  );

  const undo = useCallback(() => {
    if (!undoState || animating) return;
    const nextStatuses = statuses.slice();
    nextStatuses[undoState.index] = undoState.previousStatus;
    latestState.current = { statuses: nextStatuses, cursor: undoState.previousCursor };
    setStatuses(nextStatuses);
    setCursor(undoState.previousCursor);
    setAnnouncement(`${WORDS[undoState.index].lemma} restored to ${stateLabel(undoState.previousStatus).toLowerCase()}.`);
    setUndoState(null);
  }, [animating, statuses, undoState]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (modal || view !== 'cards' || isEditableTarget(event.target)) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        commitWithMotion(1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        commitWithMotion(2);
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [commitWithMotion, modal, undo, view]);

  const openWord = (index: number) => {
    focusCurrentCardRef.current = true;
    setCursor(index);
    setView('cards');
    setAnnouncement(`${WORDS[index].lemma} opened for review.`);
  };

  const exportProgress = () => {
    const backup = createBackup(statuses, cursor);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wordbloom-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setAnnouncement('Progress backup downloaded.');
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
    setStatuses(pendingImport.statuses);
    setCursor(importedCursor);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(serializeProgress(pendingImport.statuses, importedCursor)),
    );
    setUndoState(null);
    setPendingImport(null);
    setModal(null);
    setAnnouncement(
      pendingImport.migrated
        ? 'Older backup imported and updated for the corrected word list. Your local progress has been replaced.'
        : 'Backup imported. Your local progress has been replaced.',
    );
  };

  const confirmReset = () => {
    const empty = new Uint8Array(WORDS.length);
    latestState.current = { statuses: empty, cursor: 0 };
    setStatuses(empty);
    setCursor(0);
    setUndoState(null);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(empty, 0)));
    setModal(null);
    setAnnouncement('All progress reset. Starting again with the first word.');
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
        <button className="brand" type="button" onClick={() => setView('cards')} aria-label="Open WordBloom cards">
          <span className="brand-mark" aria-hidden="true">✿</span>
          <span>WordBloom</span>
        </button>
        <nav className="view-switch" aria-label="Vocabulary views">
          <button className={`view-pill ${view === 'cards' ? 'active' : ''}`} type="button" onClick={() => setView('cards')}>
            Cards
          </button>
          <button className={`view-pill ${view === 'overview' ? 'active' : ''}`} type="button" onClick={() => setView('overview')}>
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
                      className={`word-card current-card status-${status}`}
                      drag="x"
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
                      aria-label={`${currentWord.lemma}, rank ${currentWord.rank}, ${stateLabel(currentStatus)}`}
                      tabIndex={-1}
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
                      <p className="drag-hint">Drag the card or use your arrow keys</p>
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
              <button type="button" onClick={() => setView('overview')}><Leaf aria-hidden="true" size={18} /> Explore your overview</button>
            </section>
          )}

          <div className="below-actions">
            <button className="undo-button" type="button" onClick={undo} disabled={!undoState || animating}>
              <RotateCcw aria-hidden="true" size={15} /> Undo <span>Ctrl Z</span>
            </button>
            <p className="gentle-note"><Sprout aria-hidden="true" size={14} /> Your progress stays on this device.</p>
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
                <h2 id="modal-title">{importError ? 'That file didn’t work' : 'Replace local progress?'}</h2>
                {importError ? (
                  <>
                    <p className="modal-lede error-copy">{importError}</p>
                    <button className="primary-action full-action" type="button" onClick={() => importRef.current?.click()}>Choose another file</button>
                  </>
                ) : (
                  <>
                    <p className="modal-lede">This will replace the progress currently saved in this browser.</p>
                    <div className="modal-stats">
                      <div><strong>{pendingStats?.known.toLocaleString()}</strong><span>Known</span></div>
                      <div><strong>{pendingStats?.unknown.toLocaleString()}</strong><span>Unknown</span></div>
                      <div><strong>{pendingStats?.remaining.toLocaleString()}</strong><span>Remaining</span></div>
                    </div>
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
                <h2 id="modal-title">Reset all progress?</h2>
                <p className="modal-lede">All {stats.reviewed.toLocaleString()} decisions on this device will be removed. Export a backup first if you may want them later.</p>
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
