import { describe, expect, it } from 'vitest';
import lemmas from './lemmas.json';
import legacyMap from './legacy-v1-map.json';
import manifest from './manifest.json';
import words from './words.json';

describe('generated vocabulary data', () => {
  it('contains exactly 20,000 unique normalized entries with stable ids and ranks', () => {
    expect(words).toHaveLength(20_000);
    expect(new Set(words.map((word) => word.lemma)).size).toBe(20_000);
    words.forEach((word, index) => {
      expect(word.id).toBe(index);
      expect(word.rank).toBe(index + 1);
      expect(word.lemma).toMatch(/^[a-z]+(?:'[a-z]+)?$/);
    });
  });

  it('keeps the browser payload in exact lockstep with the canonical ranked dataset', () => {
    expect(lemmas).toEqual(words.map((word) => word.lemma));
  });

  it('sorts by descending frequency with alphabetical tie-breaking', () => {
    words.forEach((word, index) => {
      if (index === 0) return;
      const previous = words[index - 1];
      expect(word.zipf).toBeLessThanOrEqual(previous.zipf);
      if (word.zipf === previous.zipf) {
        expect(word.lemma.localeCompare(previous.lemma)).toBeGreaterThan(0);
      }
    });
  });

  it('has the reviewed top-ranked sample and excludes proper-name-only frequency entries', () => {
    expect(words.slice(0, 10).map((word) => word.lemma)).toEqual([
      'a',
      'in',
      'i',
      'it',
      'on',
      'be',
      'as',
      'are',
      'have',
      'at',
    ]);
    const lemmas = new Set(words.map((word) => word.lemma));
    for (const excluded of ['london', 'facebook', 'youtube', 'obama', 'putin', 'minecraft', 'zelda', 'naruto']) {
      expect(lemmas.has(excluded)).toBe(false);
    }
  });

  it('records the core-only OEWN source and exact dataset identity', () => {
    expect(manifest.datasetId).toBe('oewn-2025-wordfreq-en-20k-v2');
    expect(manifest.entryCount).toBe(20_000);
    expect(manifest.eligibleLemmaCount).toBeGreaterThan(20_000);
    expect(manifest.sources[0]).toMatchObject({ name: 'Open English WordNet', version: '2025' });
    expect(manifest.filters).toContain('every entry is a lemma in the Open English WordNet 2025 core lexicon');
    expect(manifest.filters).toContain('descending wordfreq Zipf score with alphabetical tie-breaking');
  });

  it('keeps a validated one-time index map for v1 progress migration', () => {
    expect(legacyMap.sourceDatasetId).toBe('oewn-2025-wordfreq-en-20k-v1');
    expect(legacyMap.targetDatasetId).toBe(manifest.datasetId);
    expect(legacyMap.mappedEntryCount).toBe(14_236);
    expect(legacyMap.targetIndexBySourceIndex).toHaveLength(20_000);
    const mapped = legacyMap.targetIndexBySourceIndex.filter((index) => index >= 0);
    expect(mapped).toHaveLength(14_236);
    expect(new Set(mapped).size).toBe(mapped.length);
    mapped.forEach((index) => expect(index).toBeLessThan(20_000));
  });
});
