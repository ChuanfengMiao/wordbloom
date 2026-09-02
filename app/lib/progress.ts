export const DATASET_ID = 'oewn-2025-wordfreq-en-20k-v2';
export const LEGACY_DATASET_ID = 'oewn-2025-wordfreq-en-20k-v1';
export const STORAGE_KEY = `wordbloom:${DATASET_ID}:progress`;
export const LEGACY_STORAGE_KEY = `wordbloom:${LEGACY_DATASET_ID}:progress`;
export const NOTES_STORAGE_KEY = `wordbloom:${DATASET_ID}:notes`;
export const MAX_NOTE_LENGTH = 1_000;

export type WordStatus = 0 | 1 | 2;
export type NamedStatus = 'known' | 'unknown';
export type WordNotes = Record<number, string>;

export type ProgressBackupV1 = {
  schemaVersion: 1;
  datasetId: string;
  exportedAt: string;
  cursor: number;
  decisions: Record<number, NamedStatus>;
};

export type ProgressBackupV2 = {
  schemaVersion: 2;
  datasetId: string;
  exportedAt: string;
  cursor: number;
  decisions: Record<number, NamedStatus>;
  notes: WordNotes;
};

export type StoredProgressV1 = {
  schemaVersion: 1;
  datasetId: string;
  updatedAt: string;
  cursor: number;
  length: number;
  bits: string;
};

export type StoredNotesV1 = {
  schemaVersion: 1;
  datasetId: string;
  updatedAt: string;
  notes: WordNotes;
};

export type DatasetMigration = {
  sourceDatasetId: string;
  targetDatasetId: string;
  targetIndexBySourceIndex: number[];
};

export function countStatuses(statuses: Uint8Array) {
  let known = 0;
  let unknown = 0;
  for (const status of statuses) {
    if (status === 1) known += 1;
    if (status === 2) unknown += 1;
  }
  return {
    known,
    unknown,
    reviewed: known + unknown,
    remaining: statuses.length - known - unknown,
  };
}

export function encodeStatuses(statuses: Uint8Array): string {
  const packed = new Uint8Array(Math.ceil(statuses.length / 4));
  for (let index = 0; index < statuses.length; index += 1) {
    packed[Math.floor(index / 4)] |= (statuses[index] & 3) << ((index % 4) * 2);
  }
  let binary = '';
  for (const byte of packed) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeStatuses(bits: string, length: number): Uint8Array {
  const binary = atob(bits);
  const expectedBytes = Math.ceil(length / 4);
  if (binary.length !== expectedBytes) throw new Error('Progress data has the wrong size.');
  const statuses = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const value = (binary.charCodeAt(Math.floor(index / 4)) >> ((index % 4) * 2)) & 3;
    if (value > 2) throw new Error('Progress data contains an invalid status.');
    statuses[index] = value;
  }
  return statuses;
}

export function normalizeNote(value: string) {
  return value.trim().length === 0 ? '' : value;
}

export function validateNotes(value: unknown, expectedLength: number): WordNotes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Notes are missing or invalid.');
  }
  const notes: WordNotes = {};
  for (const [rawIndex, note] of Object.entries(value)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= expectedLength) {
      throw new Error('Notes contain an unknown word index.');
    }
    if (typeof note !== 'string') throw new Error('Notes contain an invalid value.');
    if (note.length > MAX_NOTE_LENGTH) {
      throw new Error(`Notes cannot exceed ${MAX_NOTE_LENGTH.toLocaleString()} characters per word.`);
    }
    const normalized = normalizeNote(note);
    if (normalized) notes[index] = normalized;
  }
  return notes;
}

export function countNotes(notes: WordNotes) {
  return Object.values(notes).filter((note) => normalizeNote(note).length > 0).length;
}

export function serializeNotes(notes: WordNotes, expectedLength: number): StoredNotesV1 {
  return {
    schemaVersion: 1,
    datasetId: DATASET_ID,
    updatedAt: new Date().toISOString(),
    notes: validateNotes(notes, expectedLength),
  };
}

export function parseStoredNotes(raw: string, expectedLength: number) {
  const value = JSON.parse(raw) as Partial<StoredNotesV1>;
  if (value.schemaVersion !== 1) throw new Error('Unsupported notes version.');
  if (value.datasetId !== DATASET_ID) throw new Error('Notes belong to a different word list.');
  return validateNotes(value.notes, expectedLength);
}

export function serializeProgress(statuses: Uint8Array, cursor: number): StoredProgressV1 {
  return {
    schemaVersion: 1,
    datasetId: DATASET_ID,
    updatedAt: new Date().toISOString(),
    cursor,
    length: statuses.length,
    bits: encodeStatuses(statuses),
  };
}

function parseStoredProgressForDataset(raw: string, expectedLength: number, datasetId: string) {
  const value = JSON.parse(raw) as Partial<StoredProgressV1>;
  if (value.schemaVersion !== 1) throw new Error('Unsupported progress version.');
  if (value.datasetId !== datasetId) throw new Error('Progress belongs to a different word list.');
  if (value.length !== expectedLength || typeof value.bits !== 'string') {
    throw new Error('Progress data has the wrong word-list size.');
  }
  const cursor = Number(value.cursor);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > expectedLength) {
    throw new Error('Progress cursor is invalid.');
  }
  return { statuses: decodeStatuses(value.bits, expectedLength), cursor };
}

export function parseStoredProgress(raw: string, expectedLength: number) {
  return parseStoredProgressForDataset(raw, expectedLength, DATASET_ID);
}

function validateMigration(migration: DatasetMigration, expectedLength: number) {
  if (migration.sourceDatasetId !== LEGACY_DATASET_ID || migration.targetDatasetId !== DATASET_ID) {
    throw new Error('The dataset migration is incompatible.');
  }
  for (const targetIndex of migration.targetIndexBySourceIndex) {
    if (!Number.isInteger(targetIndex) || targetIndex < -1 || targetIndex >= expectedLength) {
      throw new Error('The dataset migration contains an invalid word index.');
    }
  }
}

function migrateStatuses(source: Uint8Array, migration: DatasetMigration, expectedLength: number) {
  validateMigration(migration, expectedLength);
  if (source.length !== migration.targetIndexBySourceIndex.length) {
    throw new Error('The saved progress has the wrong legacy word-list size.');
  }
  const statuses = new Uint8Array(expectedLength);
  source.forEach((status, sourceIndex) => {
    const targetIndex = migration.targetIndexBySourceIndex[sourceIndex];
    if (targetIndex >= 0) statuses[targetIndex] = status;
  });
  return statuses;
}

export function migrateStoredProgress(raw: string, migration: DatasetMigration, expectedLength: number) {
  const source = parseStoredProgressForDataset(
    raw,
    migration.targetIndexBySourceIndex.length,
    LEGACY_DATASET_ID,
  );
  const statuses = migrateStatuses(source.statuses, migration, expectedLength);
  const mappedCursor = migration.targetIndexBySourceIndex[source.cursor] ?? -1;
  const cursor =
    mappedCursor >= 0 && statuses[mappedCursor] === 0
      ? mappedCursor
      : findNextUnmarked(statuses, Math.max(-1, mappedCursor - 1));
  return { statuses, cursor, retained: countStatuses(statuses).reviewed };
}

export function createBackup(
  statuses: Uint8Array,
  cursor: number,
  notes: WordNotes = {},
): ProgressBackupV2 {
  const decisions: Record<number, NamedStatus> = {};
  statuses.forEach((status, index) => {
    if (status === 1) decisions[index] = 'known';
    if (status === 2) decisions[index] = 'unknown';
  });
  return {
    schemaVersion: 2,
    datasetId: DATASET_ID,
    exportedAt: new Date().toISOString(),
    cursor,
    decisions,
    notes: validateNotes(notes, statuses.length),
  };
}

export function parseBackup(raw: string, expectedLength: number, migration?: DatasetMigration) {
  const value = JSON.parse(raw) as {
    schemaVersion?: number;
    datasetId?: unknown;
    cursor?: unknown;
    decisions?: unknown;
    notes?: unknown;
  };
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) {
    throw new Error('This backup version is not supported.');
  }
  const isLegacy = value.datasetId === LEGACY_DATASET_ID && migration !== undefined;
  if (value.datasetId !== DATASET_ID && !isLegacy) throw new Error('This backup uses a different word list.');
  if (value.schemaVersion === 2 && isLegacy) {
    throw new Error('This notes backup uses a different word list.');
  }
  if (isLegacy) validateMigration(migration, expectedLength);
  if (!value.decisions || typeof value.decisions !== 'object' || Array.isArray(value.decisions)) {
    throw new Error('The backup decisions are missing or invalid.');
  }
  const sourceLength = isLegacy ? migration.targetIndexBySourceIndex.length : expectedLength;
  const cursor = Number(value.cursor);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > sourceLength) {
    throw new Error('The backup cursor is invalid.');
  }
  const statuses = new Uint8Array(expectedLength);
  for (const [rawIndex, status] of Object.entries(value.decisions)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= sourceLength) {
      throw new Error('The backup contains an unknown word index.');
    }
    if (status !== 'known' && status !== 'unknown') {
      throw new Error('The backup contains an invalid word status.');
    }
    const targetIndex = isLegacy ? migration.targetIndexBySourceIndex[index] : index;
    if (targetIndex >= 0) statuses[targetIndex] = status === 'known' ? 1 : 2;
  }
  const mappedCursor = isLegacy ? (migration.targetIndexBySourceIndex[cursor] ?? -1) : cursor;
  const restoredCursor =
    mappedCursor < expectedLength && mappedCursor >= 0 && statuses[mappedCursor] === 0
      ? mappedCursor
      : findNextUnmarked(statuses, Math.max(-1, mappedCursor - 1));
  const notes = value.schemaVersion === 2 ? validateNotes(value.notes, expectedLength) : {};
  return { statuses, cursor: restoredCursor, migrated: isLegacy, notes };
}

export function findNextUnmarked(statuses: Uint8Array, after: number) {
  for (let index = Math.max(0, after + 1); index < statuses.length; index += 1) {
    if (statuses[index] === 0) return index;
  }
  for (let index = 0; index <= Math.min(after, statuses.length - 1); index += 1) {
    if (statuses[index] === 0) return index;
  }
  return statuses.length;
}

export function calculateColumns(width: number, tileWidth = 146, gap = 12) {
  return Math.max(1, Math.floor((width + gap) / (tileWidth + gap)));
}

export function statusForSwipe(offsetX: number, velocityX: number, cardWidth: number): WordStatus {
  if (Math.abs(offsetX) >= cardWidth * 0.22) return offsetX < 0 ? 1 : 2;
  if (Math.abs(velocityX) >= 650) return velocityX < 0 ? 1 : 2;
  return 0;
}
