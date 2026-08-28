import { describe, expect, it } from 'vitest';
import words from './words.json';

describe('generated vocabulary data', () => {
  it('contains 20,000 unique normalized frequency-ranked entries', () => {
    expect(words).toHaveLength(20_000);
    expect(new Set(words.map((word) => word.lemma)).size).toBe(20_000);
    words.forEach((word, index) => {
      expect(word.id).toBe(index);
      expect(word.rank).toBe(index + 1);
      expect(word.lemma).toMatch(/^[a-z]+(?:'[a-z]+)?$/);
      if (index > 0) expect(word.zipf).toBeLessThanOrEqual(words[index - 1].zipf);
    });
  });
});
