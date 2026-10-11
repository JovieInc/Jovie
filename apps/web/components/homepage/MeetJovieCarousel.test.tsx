import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = () =>
  readFileSync(resolve(__dirname, 'MeetJovieCarousel.tsx'), 'utf8');

describe('MeetJovieCarousel source contract', () => {
  it('makes the scrollable profile preview rail itself keyboard-focusable with an accessible name', () => {
    const componentSource = source();

    expect(componentSource).toContain('tabIndex={0}');
    expect(componentSource).toContain('<section');
    expect(componentSource).toContain("aria-label='Artist Profile Previews'");
    expect(componentSource).toContain('onKeyDown={handleRailKeyDown}');
    expect(componentSource).not.toContain(
      'homepage-artist-profiles__keyboard-scroll-control'
    );
  });

  it('scrolls the rail with arrow keys in both directions', () => {
    const componentSource = source();

    expect(componentSource).toContain("event.key === 'ArrowRight'");
    expect(componentSource).toContain("event.key === 'ArrowLeft'");
    expect(componentSource).toContain("scrollRail('next')");
    expect(componentSource).toContain("scrollRail('previous')");
  });
});
