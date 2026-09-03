import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');
const rule = (selector: string) => css.split(`${selector} {`)[1]?.split('}')[0];

describe('two-sided card surface contracts', () => {
  it('carries the rounded outline through the intermediate 3D layer to both faces', () => {
    expect(rule('.word-card')).toContain('border-radius: var(--card-radius)');
    expect(rule('.card-flipper')).toContain('border-radius: inherit');
    expect(rule('.card-flipper')).toContain('transform-style: preserve-3d');
    expect(rule('.card-face')).toContain('border-radius: inherit');
    expect(rule('.card-face')).toContain('overflow: hidden');
    expect(rule('.card-face')).toContain('backface-visibility: hidden');
  });

  it('places the surface on the faces instead of behind the rotating card', () => {
    expect(rule('.current-card')).toContain('background: transparent');
    expect(rule('.current-card')).toContain('border: 0');
    expect(rule('.card-face')).toContain('background: var(--card-surface)');
    expect(rule('.card-face')).toContain('box-shadow: var(--card-shadow)');
    expect(rule('.note-card-face')).not.toContain('gradient');
  });
});
