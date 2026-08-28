import { describe, expect, it } from 'vitest';
import {
  calculateColumns,
  countStatuses,
  createBackup,
  decodeStatuses,
  encodeStatuses,
  findNextUnmarked,
  parseBackup,
  parseStoredProgress,
  serializeProgress,
} from './progress';

describe('compact progress state', () => {
  it('round-trips two-bit statuses', () => {
    const statuses = Uint8Array.from([0, 1, 2, 0, 2, 1, 1, 0, 2]);
    expect(Array.from(decodeStatuses(encodeStatuses(statuses), statuses.length))).toEqual(Array.from(statuses));
  });

  it('round-trips stored progress and sparse backups', () => {
    const statuses = Uint8Array.from([1, 0, 2, 1]);
    expect(Array.from(parseStoredProgress(JSON.stringify(serializeProgress(statuses, 1)), 4).statuses)).toEqual([1, 0, 2, 1]);
    const backup = createBackup(statuses, 1);
    const parsed = parseBackup(JSON.stringify(backup), 4);
    expect(Array.from(parsed.statuses)).toEqual([1, 0, 2, 1]);
    expect(parsed.cursor).toBe(1);
  });

  it('rejects mismatched datasets and invalid statuses', () => {
    const backup = createBackup(Uint8Array.from([1, 0]), 1);
    expect(() => parseBackup(JSON.stringify({ ...backup, datasetId: 'other' }), 2)).toThrow(/different word list/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, decisions: { 0: 'maybe' } }), 2)).toThrow(/invalid word status/i);
  });

  it('counts, wraps to the next unmarked word, and calculates responsive columns', () => {
    const statuses = Uint8Array.from([1, 0, 2, 1, 0]);
    expect(countStatuses(statuses)).toEqual({ known: 2, unknown: 1, reviewed: 3, remaining: 2 });
    expect(findNextUnmarked(statuses, 1)).toBe(4);
    expect(findNextUnmarked(statuses, 4)).toBe(1);
    expect(findNextUnmarked(Uint8Array.from([1, 2]), 1)).toBe(2);
    expect(calculateColumns(320, 116, 12)).toBe(2);
    expect(calculateColumns(900, 146, 12)).toBe(5);
  });
});
