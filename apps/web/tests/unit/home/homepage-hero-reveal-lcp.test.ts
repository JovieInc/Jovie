import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');

function readHomeCss(): string {
  return readFileSync(path.join(webRoot, 'app/(home)/home.css'), 'utf8');
}

/**
 * JOV-7286 — /solutions/artists mobile LCP regression.
 *
 * The poster/editorial hero reveal fades copy, seam, and media in from a
 * transparent first frame. A `from { opacity: 0 }` first frame makes the
 * hero content ineligible as an LCP candidate in Chromium, so the
 * post-hydration cookie banner became the page's LCP element at its late
 * mount time (~2.7s). The keyframe must keep a non-zero opacity floor so
 * the hero registers at first paint; 0.01 is visually identical to 0.
 */
describe('homepage hero reveal LCP eligibility (JOV-7286)', () => {
  it('never starts the hero reveal keyframes at opacity 0', () => {
    const css = readHomeCss();
    const keyframes = css.match(
      /@keyframes homepage-hero-content-reveal\s*{[\s\S]*?}\s*}/
    );
    expect(keyframes).not.toBeNull();
    const from = keyframes?.[0].match(/from\s*{([^}]*)}/);
    expect(from).not.toBeNull();
    const opacity = from?.[1].match(/opacity:\s*([\d.]+)/);
    expect(opacity).not.toBeNull();
    expect(Number.parseFloat(opacity?.[1] ?? '0')).toBeGreaterThan(0);
  });
});
