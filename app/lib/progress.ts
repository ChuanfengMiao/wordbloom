export const DATASET_ID = 'oewn-2025-wordfreq-en-20k-v1';
export const STORAGE_KEY = `wordbloom:${DATASET_ID}:progress`;

export type WordStatus = 0 | 1 | 2;
export type NamedStatus = 'known' | 'unknown';

export type ProgressBackupV1 = {
  schemaVersion: 1;
  datasetId: string;
  exportedAt: string;
  cursor: number;
  decisions: Record<number, NamedStatus>;
};

export type StoredProgressV1 = {
  schemaVersion: 1;
  datasetId: string;
  updatedAt: string;
  cursor: number;
  length: number;
  bits: string;
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

export function parseStoredProgress(raw: string, expectedLength: number) {
  const value = JSON.parse(raw) as Partial<StoredProgressV1>;
  if (value.schemaVersion !== 1) throw new Error('Unsupported progress version.');
  if (value.datasetId !== DATASET_ID) throw new Error('Progress belongs to a different word list.');
  if (value.length !== expectedLength || typeof value.bits !== 'string') {
    throw new Error('Progress data has the wrong word-list size.');
  }
  const cursor = Number(value.cursor);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > expectedLength) {
    throw new Error('Progress cursor is invalid.');
  }
  return { statuses: decodeStatuses(value.bits, expectedLength), cursor };
}

export function createBackup(statuses: Uint8Array, cursor: number): ProgressBackupV1 {
  const decisions: Record<number, NamedStatus> = {};
  statuses.forEach((status, index) => {
    if (status === 1) decisions[index] = 'known';
    if (status === 2) decisions[index] = 'unknown';
  });
  return {
    schemaVersion: 1,
    datasetId: DATASET_ID,
    exportedAt: new Date().toISOString(),
    cursor,
    decisions,
  };
}

export function parseBackup(raw: string, expectedLength: number) {
  const value = JSON.parse(raw) as Partial<ProgressBackupV1>;
  if (value.schemaVersion !== 1) throw new Error('This backup version is not supported.');
  if (value.datasetId !== DATASET_ID) throw new Error('This backup uses a different word list.');
  if (!value.decisions || typeof value.decisions !== 'object' || Array.isArray(value.decisions)) {
    throw new Error('The backup decisions are missing or invalid.');
  }
  const cursor = Number(value.cursor);
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > expectedLength) {
    throw new Error('The backup cursor is invalid.');
  }
  const statuses = new Uint8Array(expectedLength);
  for (const [rawIndex, status] of Object.entries(value.decisions)) {
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= expectedLength) {
      throw new Error('The backup contains an unknown word index.');
    }
    if (status !== 'known' && status !== 'unknown') {
      throw new Error('The backup contains an invalid word status.');
    }
    statuses[index] = status === 'known' ? 1 : 2;
  }
  return { statuses, cursor };
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
