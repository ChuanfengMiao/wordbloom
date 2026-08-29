import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('app/globals.css', 'utf8');

describe('responsive and motion styles', () => {
  it('keeps the progress and backup control available on mobile', () => {
    expect(css).not.toContain('.quiet-button { display: none; }');
    expect(css).toContain('.progress-menu-button { width: 38px; height: 38px; padding: 0; display: grid; place-items: center; }');
    expect(css).toContain('.progress-menu-button .progress-label { display: none; }');
  });

  it('retains the reduced-motion override', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('transition-duration: .01ms !important');
    expect(css).toContain('animation-duration: .01ms !important');
  });
});
