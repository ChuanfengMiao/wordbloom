import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import legacyMap from '../data/legacy-v1-map.json';
import words from '../data/words.json';
import {
  createBackup,
  encodeStatuses,
  LEGACY_DATASET_ID,
  LEGACY_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  parseStoredNotes,
  serializeNotes,
  serializeProgress,
  STORAGE_KEY,
} from '../lib/progress';
import { setReducedMotion } from '../../tests/setup';
import { WordBloomApp } from './WordBloomApp';

const first = words[0];
const second = words[1];
const third = words[2];

const decisionSounds = vi.hoisted(() => ({ play: vi.fn(), stop: vi.fn(), dispose: vi.fn() }));
vi.mock('../lib/decision-sounds', () => ({ createDecisionSounds: () => decisionSounds }));

class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

let spokenUtterances: MockSpeechSynthesisUtterance[];
let speechCancelCount: number;
let speechVoices: SpeechSynthesisVoice[];
let voicesChangedListener: (() => void) | null;

function testVoice(name: string, lang: string, localService = false, isDefault = false) {
  return { name, lang, localService, default: isDefault, voiceURI: name } as SpeechSynthesisVoice;
}

function installSpeechSynthesis() {
  spokenUtterances = [];
  speechCancelCount = 0;
  speechVoices = [testVoice('Remote US', 'en-US', false, true), testVoice('Local US', 'en-US', true, true)];
  voicesChangedListener = null;
  Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: MockSpeechSynthesisUtterance,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => speechVoices,
      speak: (utterance: MockSpeechSynthesisUtterance) => {
        spokenUtterances.push(utterance);
        utterance.onstart?.();
      },
      cancel: () => {
        speechCancelCount += 1;
      },
      addEventListener: (event: string, listener: () => void) => {
        if (event === 'voiceschanged') voicesChangedListener = listener;
      },
      removeEventListener: (event: string, listener: () => void) => {
        if (event === 'voiceschanged' && voicesChangedListener === listener) voicesChangedListener = null;
      },
    },
  });
}

async function renderHydrated() {
  const result = render(<WordBloomApp />);
  await waitFor(() => expect(screen.getByRole('button', { name: /i know itknown/i })).toBeEnabled());
  await act(async () => {});
  return result;
}

describe('WordBloom interactions', () => {
  beforeEach(() => {
    localStorage.clear();
    setReducedMotion(true);
    installSpeechSynthesis();
    decisionSounds.play.mockClear();
    decisionSounds.stop.mockClear();
    decisionSounds.dispose.mockClear();
  });

  it('keeps only three cards mounted and maps buttons to the requested states', async () => {
    const user = userEvent.setup();
    const { container } = await renderHydrated();
    expect(container.querySelectorAll('.word-card')).toHaveLength(3);
    expect(screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, unmarked`, 'i'))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /i know itknown/i }));
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`${first.lemma} marked known`, 'i'));

    await user.click(screen.getByRole('button', { name: /not yetunknown/i }));
    expect(screen.getByLabelText(new RegExp(`${third.lemma}, rank 3, unmarked`, 'i'))).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`${second.lemma} marked unknown`, 'i'));
  });

  it('virtualizes the unfiltered 20,000-word overview', async () => {
    const user = userEvent.setup();
    const { container } = await renderHydrated();
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    await waitFor(() => expect(container.querySelectorAll('.word-tile').length).toBeGreaterThan(0));
    expect(container.querySelectorAll('.word-tile').length).toBeLessThan(200);
  });

  it('maps arrow keys and supports both Ctrl+Z and Cmd+Z one-step undo', async () => {
    await renderHydrated();
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByLabelText(new RegExp(`${third.lemma}, rank 3, unmarked`, 'i'))).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'z', metaKey: true });
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
  });

  it('plays and replays the current word with the preferred American voice', async () => {
    const user = userEvent.setup();
    await renderHydrated();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(spokenUtterances).toHaveLength(1);
    expect(spokenUtterances[0]).toMatchObject({
      text: first.lemma,
      lang: 'en-US',
      rate: 0.9,
      pitch: 1,
      volume: 1,
      voice: speechVoices[1],
    });

    const cancelsBeforeReplay = speechCancelCount;
    await user.click(screen.getByRole('button', { name: new RegExp(`replay american pronunciation of ${first.lemma}`, 'i') }));
    expect(spokenUtterances).toHaveLength(2);
    expect(speechCancelCount).toBeGreaterThan(cancelsBeforeReplay);
  });

  it('refreshes delayed voices and reports speech failures', async () => {
    const user = userEvent.setup();
    speechVoices = [];
    await renderHydrated();
    const delayedVoice = testVoice('Delayed US', 'en-US', true, true);
    speechVoices = [delayedVoice];
    act(() => voicesChangedListener?.());
    await user.click(screen.getByRole('button', { name: new RegExp(`play american pronunciation of ${first.lemma}`, 'i') }));
    expect(spokenUtterances.at(-1)?.voice).toBe(delayedVoice);

    act(() => spokenUtterances.at(-1)?.onerror?.({ error: 'voice-unavailable' }));
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`pronunciation for ${first.lemma} could not be played`, 'i'));
  });

  it('cancels active pronunciation when the current word changes', async () => {
    await renderHydrated();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    const cancelsBeforeNavigation = speechCancelCount;
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
    expect(speechCancelCount).toBeGreaterThan(cancelsBeforeNavigation);
  });

  it('disables pronunciation controls and announces unsupported browsers', async () => {
    Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
    await renderHydrated();
    expect(screen.getByRole('button', { name: new RegExp(`play american pronunciation of ${first.lemma}`, 'i') })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(screen.getByRole('status')).toHaveTextContent(/pronunciation is not available/i);
  });

  it('uses vertical shortcuts in notes, preserves other editing keys, autosaves, and restores focus', async () => {
    const user = userEvent.setup();
    const { container } = await renderHydrated();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const editor = screen.getByRole('textbox', { name: /your note/i });
    await waitFor(() => expect(editor).toHaveFocus());
    expect(container.querySelector('.current-card')).toHaveClass('is-flipped');

    await user.type(editor, 'Remember this cue');
    expect(fireEvent.keyDown(editor, { key: 'ArrowLeft' })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'ArrowDown', shiftKey: true })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'ArrowUp', ctrlKey: true })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'ArrowUp', altKey: true })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'ArrowDown', metaKey: true })).toBe(true);
    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(container.querySelector('.current-card')).toHaveClass('is-flipped');
    fireEvent.keyDown(editor, { key: 'ArrowUp' });
    expect(spokenUtterances.at(-1)?.text).toBe(first.lemma);
    expect(editor).toHaveFocus();
    expect(editor).toHaveValue('Remember this cue');
    expect(decisionSounds.play).not.toHaveBeenCalled();
    expect(screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, unmarked`, 'i'))).toBeInTheDocument();

    await waitFor(() => expect(parseStoredNotes(localStorage.getItem(NOTES_STORAGE_KEY)!, words.length)[first.id]).toBe('Remember this cue'), { timeout: 1_000 });

    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    const card = screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, unmarked, front side`, 'i'));
    await waitFor(() => expect(card).toHaveFocus());
  });

  it('keeps Down Arrow repeat from reflipping and exposes matching shortcuts on both faces', async () => {
    const user = userEvent.setup();
    const { container } = await renderHydrated();
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    const editor = screen.getByRole('textbox', { name: /your note/i });
    await waitFor(() => expect(editor).toHaveFocus());
    fireEvent.keyDown(editor, { key: 'ArrowDown', repeat: true });
    fireEvent.keyDown(editor, { key: 'ArrowDown', isComposing: true });
    expect(container.querySelector('.current-card')).toHaveClass('is-flipped');
    const listen = screen.getByRole('button', { name: /play american pronunciation/i });
    expect(listen).toHaveAttribute('aria-keyshortcuts', 'ArrowUp');
    await user.click(listen);
    expect(spokenUtterances).toHaveLength(1);
    const showFront = screen.getByRole('button', { name: /show the front/i });
    expect(showFront).toHaveAttribute('aria-keyshortcuts', 'ArrowDown');
    expect(showFront).toHaveTextContent('↓');
    await user.click(showFront);
    expect(container.querySelector('.current-card')).not.toHaveClass('is-flipped');
    expect(container.querySelectorAll('.word-card')).toHaveLength(3);
    expect(container.querySelector('.note-card-face')).toHaveAttribute('inert');
    expect(container.querySelector('.card-flipper')).toHaveClass('reduced-flip');
  });

  it('plays one cue per accepted decision and no cues for undo, notes, or dialogs', async () => {
    const user = userEvent.setup();
    const { unmount } = await renderHydrated();
    expect(decisionSounds.play).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /i know itknown/i }));
    expect(decisionSounds.play).toHaveBeenNthCalledWith(1, 1);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(decisionSounds.play).toHaveBeenNthCalledWith(2, 2);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(decisionSounds.stop).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /open progress and backup/i }));
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(decisionSounds.play).toHaveBeenCalledTimes(2);
    unmount();
    expect(decisionSounds.dispose).toHaveBeenCalledOnce();
  });

  it('flushes a back-side note before pointer classification advances', async () => {
    const user = userEvent.setup();
    await renderHydrated();
    await user.click(screen.getByRole('button', { name: new RegExp(`open notes for ${first.lemma}`, 'i') }));
    const editor = screen.getByRole('textbox', { name: /your note/i });
    await user.type(editor, 'Saved before advancing');
    await user.click(screen.getByRole('button', { name: /i know itknown/i }));

    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
    expect(decisionSounds.play).toHaveBeenCalledExactlyOnceWith(1);
    expect(parseStoredNotes(localStorage.getItem(NOTES_STORAGE_KEY)!, words.length)[first.id]).toBe('Saved before advancing');
  });

  it('keeps an in-memory note and announces local-storage write failures', async () => {
    const user = userEvent.setup();
    await renderHydrated();
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === NOTES_STORAGE_KEY) throw new DOMException('Quota exceeded', 'QuotaExceededError');
      return originalSetItem.call(this, key, value);
    });
    try {
      await user.click(screen.getByRole('button', { name: new RegExp(`open notes for ${first.lemma}`, 'i') }));
      const editor = screen.getByRole('textbox', { name: /your note/i });
      await user.type(editor, 'Still in memory');
      fireEvent.blur(editor);
      expect(editor).toHaveValue('Still in memory');
      expect(screen.getByRole('status')).toHaveTextContent(/could not be saved on this device/i);
    } finally {
      setItem.mockRestore();
    }
  });

  it('flushes the current note before exporting a combined backup', async () => {
    const user = userEvent.setup();
    let exportedBlob: Blob | null = null;
    const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        exportedBlob = blob;
        return 'blob:wordbloom-test';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const linkClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    try {
      await renderHydrated();
      await user.click(screen.getByRole('button', { name: new RegExp(`open notes for ${first.lemma}`, 'i') }));
      await user.type(screen.getByRole('textbox', { name: /your note/i }), 'Export this cue');
      await user.click(screen.getByRole('button', { name: /open progress and backup/i }));
      await user.click(screen.getByRole('button', { name: /export backup/i }));

      expect(exportedBlob).toBeInstanceOf(Blob);
      expect(parseStoredNotes(localStorage.getItem(NOTES_STORAGE_KEY)!, words.length)[first.id]).toBe('Export this cue');
      expect(screen.getByRole('status')).toHaveTextContent(/progress and notes backup downloaded/i);
    } finally {
      linkClick.mockRestore();
      if (originalCreateObjectUrl) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
      else delete (URL as Partial<typeof URL>).createObjectURL;
      if (originalRevokeObjectUrl) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
      else delete (URL as Partial<typeof URL>).revokeObjectURL;
    }
  });

  it('searches, filters, labels, revisits, and reclassifies overview words', async () => {
    const user = userEvent.setup();
    await renderHydrated();
    await user.click(screen.getByRole('button', { name: /i know itknown/i }));
    await user.click(screen.getByRole('button', { name: 'Overview' }));

    const search = screen.getByRole('searchbox', { name: /search words/i });
    await user.type(search, first.lemma);
    await user.click(screen.getByRole('button', { name: 'Known' }));
    expect(screen.getByText('1', { selector: '.results-count strong' })).toBeInTheDocument();
    const tile = await screen.findByRole('button', { name: new RegExp(`${first.lemma}, rank 1, known`, 'i') });
    expect(tile).toHaveTextContent('Known');

    await user.click(tile);
    const reopened = screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, known`, 'i'));
    await waitFor(() => expect(reopened).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /not yetunknown/i }));
    expect(screen.getByText('0', { selector: '.summary-strip > div:nth-child(2) strong' })).toBeInTheDocument();
    expect(screen.getByText('1', { selector: '.summary-strip > div:nth-child(3) strong' })).toBeInTheDocument();
  });

  it('renders completion from persisted progress and retains explicit state labels', async () => {
    const complete = new Uint8Array(words.length);
    complete.fill(1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(complete, words.length)));
    render(<WordBloomApp />);

    expect(await screen.findByRole('heading', { name: /vocabulary garden is mapped/i })).toBeInTheDocument();
    expect(screen.getByText(/20,000 known words/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /explore your overview/i })).toBeInTheDocument();
  });

  it('traps dialog focus, closes on Escape, and restores the opener', async () => {
    const user = userEvent.setup();
    await renderHydrated();
    const opener = screen.getByRole('button', { name: /open progress and backup/i });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: /progress & backup/i });
    const close = screen.getByRole('button', { name: /close dialog/i });
    await waitFor(() => expect(close).toHaveFocus());
    await user.tab({ shift: true });
    expect(screen.getByRole('link', { name: /read data source information/i })).toHaveFocus();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('moves focus into each dialog step and supports resetting progress', async () => {
    const user = userEvent.setup();
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(serializeNotes({ 0: 'remove me' }, words.length)));
    await renderHydrated();
    await user.click(screen.getByRole('button', { name: /i know itknown/i }));
    await user.click(screen.getByRole('button', { name: /open progress and backup/i }));
    await user.click(screen.getByRole('button', { name: /reset all/i }));

    expect(screen.getByRole('dialog', { name: /reset all local data/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /close dialog/i })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /reset everything/i }));
    expect(screen.getByText('0', { selector: '.summary-strip > div:first-child strong' })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, unmarked`, 'i'))).toBeInTheDocument();
    expect(localStorage.getItem(NOTES_STORAGE_KEY)).toBeNull();
  });

  it('imports a validated backup through the confirmation dialog', async () => {
    const user = userEvent.setup();
    const { container } = await renderHydrated();
    const statuses = new Uint8Array(words.length);
    statuses[first.id] = 1;
    const backup = createBackup(statuses, second.id, { 0: 'Imported cue' });
    const file = new File([JSON.stringify(backup)], 'backup.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(backup)) });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    expect(await screen.findByRole('dialog', { name: /replace local data/i })).toBeInTheDocument();
    expect(screen.getByText(/1 notes in this backup/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /replace progress/i }));

    expect(screen.getByText('1', { selector: '.summary-strip > div:nth-child(2) strong' })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
    expect(parseStoredNotes(localStorage.getItem(NOTES_STORAGE_KEY)!, words.length)[first.id]).toBe('Imported cue');
  });

  it('migrates compatible v1 local progress and persists it under the v2 key', async () => {
    const sourceIndex = legacyMap.targetIndexBySourceIndex.findIndex((index) => index >= 0);
    const targetIndex = legacyMap.targetIndexBySourceIndex[sourceIndex];
    const legacyStatuses = new Uint8Array(legacyMap.targetIndexBySourceIndex.length);
    legacyStatuses[sourceIndex] = 1;
    localStorage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        datasetId: LEGACY_DATASET_ID,
        updatedAt: new Date().toISOString(),
        cursor: sourceIndex + 1,
        length: legacyStatuses.length,
        bits: encodeStatuses(legacyStatuses),
      }),
    );

    render(<WordBloomApp />);
    expect(await screen.findByText(/1 classifications were retained/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('1', { selector: '.summary-strip > div:nth-child(2) strong' })).toBeInTheDocument());
    expect(targetIndex).toBeGreaterThanOrEqual(0);
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull(), { timeout: 1_000 });
  });

  it('starts fresh with an announcement when stored progress is corrupt', async () => {
    localStorage.setItem(STORAGE_KEY, '{');
    render(<WordBloomApp />);
    expect(await screen.findByText(/saved progress could not be read/i)).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, unmarked`, 'i'))).toBeInTheDocument();
  });

  it('commits synchronously when reduced motion is requested', async () => {
    setReducedMotion(true);
    await renderHydrated();
    fireEvent.click(screen.getByRole('button', { name: /i know itknown/i }));
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
  });
});
