import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(__dirname, 'MeetJovieCarousel.tsx'), 'utf8');

describe('MeetJovieCarousel source contract', () => {
  it('keeps the scrollable profile preview rail keyboard-reachable through a native control', () => {
    const componentSource = source();

    expect(componentSource).toContain(
      'homepage-artist-profiles__keyboard-scroll-control'
    );
    expect(componentSource).toContain('Scroll Artist Profile Previews');
    expect(componentSource).toContain("type='button'");
    expect(componentSource).not.toContain('tabIndex={0}');
  });
});
