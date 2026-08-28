import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WordBloomApp } from './WordBloomApp';

describe('WordBloom interactions', () => {
  beforeEach(() => localStorage.clear());

  it('keeps only three deck cards mounted and maps buttons to the requested states', async () => {
    const user = userEvent.setup();
    const { container } = render(<WordBloomApp />);
    expect(container.querySelectorAll('.word-card')).toHaveLength(3);
    expect(screen.getByLabelText(/the, rank 1, unmarked/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'I know itKnown' }));
    await waitFor(() => expect(screen.getByLabelText(/to, rank 2, unmarked/i)).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(/the marked known/i);
  });

  it('maps arrow keys left to known and right to unknown, then supports undo', async () => {
    const user = userEvent.setup();
    render(<WordBloomApp />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/the marked known/i));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/to marked unknown/i));

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(screen.getByLabelText(/to, rank 2, unmarked/i)).toBeInTheDocument();
  });

  it('exposes overview search, explicit filters, and a virtualized subset of tiles', async () => {
    const user = userEvent.setup();
    const { container } = render(<WordBloomApp />);
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    expect(screen.getByRole('searchbox', { name: /search words/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Known' })).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('.word-tile').length).toBeLessThan(200);
  });
});
