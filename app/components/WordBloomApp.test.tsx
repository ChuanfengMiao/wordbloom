import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import legacyMap from '../data/legacy-v1-map.json';
import words from '../data/words.json';
import {
  createBackup,
  encodeStatuses,
  LEGACY_DATASET_ID,
  LEGACY_STORAGE_KEY,
  serializeProgress,
  STORAGE_KEY,
} from '../lib/progress';
import { setReducedMotion } from '../../tests/setup';
import { WordBloomApp } from './WordBloomApp';

const first = words[0];
const second = words[1];
const third = words[2];

async function renderHydrated() {
  const result = render(<WordBloomApp />);
  await waitFor(() => expect(screen.getByRole('button', { name: /i know itknown/i })).toBeEnabled());
  return result;
}

describe('WordBloom interactions', () => {
  beforeEach(() => {
    localStorage.clear();
    setReducedMotion(true);
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
    await renderHydrated();
    await user.click(screen.getByRole('button', { name: /i know itknown/i }));
    await user.click(screen.getByRole('button', { name: /open progress and backup/i }));
    await user.click(screen.getByRole('button', { name: /reset all/i }));

    expect(screen.getByRole('dialog', { name: /reset all progress/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /close dialog/i })).toHaveFocus());
    await user.click(screen.getByRole('button', { name: /reset everything/i }));
    expect(screen.getByText('0', { selector: '.summary-strip > div:first-child strong' })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`${first.lemma}, rank 1, unmarked`, 'i'))).toBeInTheDocument();
  });

  it('imports a validated backup through the confirmation dialog', async () => {
    const user = userEvent.setup();
    const { container } = await renderHydrated();
    const statuses = new Uint8Array(words.length);
    statuses[first.id] = 1;
    const file = new File([JSON.stringify(createBackup(statuses, second.id))], 'backup.json', {
      type: 'application/json',
    });
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(JSON.stringify(createBackup(statuses, second.id))) });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { files: [file] } });
    expect(await screen.findByRole('dialog', { name: /replace local progress/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /replace progress/i }));

    expect(screen.getByText('1', { selector: '.summary-strip > div:nth-child(2) strong' })).toBeInTheDocument();
    expect(screen.getByLabelText(new RegExp(`${second.lemma}, rank 2, unmarked`, 'i'))).toBeInTheDocument();
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
