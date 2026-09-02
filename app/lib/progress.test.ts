import { describe, expect, it } from 'vitest';
import {
  calculateColumns,
  countNotes,
  countStatuses,
  createBackup,
  DATASET_ID,
  type DatasetMigration,
  decodeStatuses,
  encodeStatuses,
  findNextUnmarked,
  LEGACY_DATASET_ID,
  MAX_NOTE_LENGTH,
  migrateStoredProgress,
  normalizeNote,
  parseBackup,
  parseStoredNotes,
  parseStoredProgress,
  serializeNotes,
  serializeProgress,
  statusForSwipe,
} from './progress';

const migration: DatasetMigration = {
  sourceDatasetId: LEGACY_DATASET_ID,
  targetDatasetId: DATASET_ID,
  targetIndexBySourceIndex: [1, -1, 0, 2],
};

function legacyStored(statuses: Uint8Array, cursor: number) {
  return JSON.stringify({
    schemaVersion: 1,
    datasetId: LEGACY_DATASET_ID,
    updatedAt: new Date().toISOString(),
    cursor,
    length: statuses.length,
    bits: encodeStatuses(statuses),
  });
}

describe('compact progress state', () => {
  it('round-trips two-bit statuses and rejects corrupt packed data', () => {
    const statuses = Uint8Array.from([0, 1, 2, 0, 2, 1, 1, 0, 2]);
    expect(Array.from(decodeStatuses(encodeStatuses(statuses), statuses.length))).toEqual(Array.from(statuses));
    expect(() => decodeStatuses(encodeStatuses(Uint8Array.from([3])), 1)).toThrow(/invalid status/i);
    expect(() => decodeStatuses('', 5)).toThrow(/wrong size/i);
  });

  it('round-trips stored progress and sparse backups', () => {
    const statuses = Uint8Array.from([1, 0, 2, 1]);
    const stored = parseStoredProgress(JSON.stringify(serializeProgress(statuses, 1)), 4);
    expect(Array.from(stored.statuses)).toEqual([1, 0, 2, 1]);
    expect(stored.cursor).toBe(1);

    const parsed = parseBackup(JSON.stringify(createBackup(statuses, 1, { 0: 'article cue' })), 4);
    expect(Array.from(parsed.statuses)).toEqual([1, 0, 2, 1]);
    expect(parsed.cursor).toBe(1);
    expect(parsed.migrated).toBe(false);
    expect(parsed.notes).toEqual({ 0: 'article cue' });
  });

  it('round-trips sparse local notes and removes blank values', () => {
    const stored = serializeNotes({ 0: 'first cue', 1: '   ', 3: 'another cue' }, 4);
    expect(parseStoredNotes(JSON.stringify(stored), 4)).toEqual({ 0: 'first cue', 3: 'another cue' });
    expect(normalizeNote('   ')).toBe('');
    expect(countNotes({ 0: 'cue', 1: '   ' })).toBe(1);
  });

  it('migrates compatible stored progress and backups from dataset v1', () => {
    const stored = migrateStoredProgress(legacyStored(Uint8Array.from([1, 2, 0, 2]), 2), migration, 3);
    expect(Array.from(stored.statuses)).toEqual([0, 1, 2]);
    expect(stored.cursor).toBe(0);
    expect(stored.retained).toBe(2);

    const backup = {
      schemaVersion: 1,
      datasetId: LEGACY_DATASET_ID,
      exportedAt: new Date().toISOString(),
      cursor: 2,
      decisions: { 0: 'known', 1: 'unknown', 3: 'unknown' },
    };
    const parsed = parseBackup(JSON.stringify(backup), 3, migration);
    expect(Array.from(parsed.statuses)).toEqual([0, 1, 2]);
    expect(parsed.cursor).toBe(0);
    expect(parsed.migrated).toBe(true);
    expect(parsed.notes).toEqual({});
  });

  it('rejects malformed, incompatible, and out-of-range stored progress', () => {
    const stored = serializeProgress(Uint8Array.from([1, 0]), 1);
    expect(() => parseStoredProgress('{', 2)).toThrow();
    expect(() => parseStoredProgress(JSON.stringify({ ...stored, schemaVersion: 2 }), 2)).toThrow(/version/i);
    expect(() => parseStoredProgress(JSON.stringify({ ...stored, datasetId: 'other' }), 2)).toThrow(/different word list/i);
    expect(() => parseStoredProgress(JSON.stringify({ ...stored, length: 3 }), 2)).toThrow(/word-list size/i);
    expect(() => parseStoredProgress(JSON.stringify({ ...stored, cursor: 3 }), 2)).toThrow(/cursor/i);
  });

  it('rejects malformed, incompatible, and out-of-range backups', () => {
    const backup = createBackup(Uint8Array.from([1, 0]), 1);
    expect(() => parseBackup('{', 2)).toThrow();
    expect(() => parseBackup(JSON.stringify({ ...backup, schemaVersion: 3 }), 2)).toThrow(/version/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, datasetId: 'other' }), 2)).toThrow(/different word list/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, decisions: [] }), 2)).toThrow(/decisions/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, decisions: { 0: 'maybe' } }), 2)).toThrow(/invalid word status/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, decisions: { 2: 'known' } }), 2)).toThrow(/unknown word index/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, cursor: -1 }), 2)).toThrow(/cursor/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, notes: [] }), 2)).toThrow(/notes/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, notes: { 2: 'cue' } }), 2)).toThrow(/word index/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, notes: { 0: 12 } }), 2)).toThrow(/invalid value/i);
    expect(() => parseBackup(JSON.stringify({ ...backup, notes: { 0: 'x'.repeat(MAX_NOTE_LENGTH + 1) } }), 2)).toThrow(/exceed/i);
  });

  it('accepts schema-version-1 backups with an empty note set', () => {
    const legacyShape = {
      schemaVersion: 1,
      datasetId: DATASET_ID,
      exportedAt: new Date().toISOString(),
      cursor: 1,
      decisions: { 0: 'known' },
    };
    expect(parseBackup(JSON.stringify(legacyShape), 2).notes).toEqual({});
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

describe('swipe classification', () => {
  it('commits at exactly 22% of card width in the offset direction', () => {
    expect(statusForSwipe(-110, 0, 500)).toBe(1);
    expect(statusForSwipe(110, 0, 500)).toBe(2);
  });

  it('commits at exactly 650 px/s in the velocity direction', () => {
    expect(statusForSwipe(0, -650, 500)).toBe(1);
    expect(statusForSwipe(0, 650, 500)).toBe(2);
    expect(statusForSwipe(-20, 700, 500)).toBe(2);
    expect(statusForSwipe(20, -700, 500)).toBe(1);
  });

  it('cancels below both thresholds', () => {
    expect(statusForSwipe(-109.99, -649.99, 500)).toBe(0);
    expect(statusForSwipe(109.99, 649.99, 500)).toBe(0);
  });
});
