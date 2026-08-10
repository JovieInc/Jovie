import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-4932 — /new production defect contracts.
 *
 * 1. The global profile viewport lock (globals.css) must be scoped to the
 *    actual outer profile document. Nested previews (marketing phone mockup,
 *    dashboard previews) mark their viewport `.profile-viewport--embedded`
 *    and must not lock the host marketing page below 768px.
 * 2. The canonical pricing row must span the shared 12-column shell so the
 *    three tier-cards-recommended cards form a usable row at desktop widths
 *    instead of collapsing into a single auto-placed track.
 * 3. Under prefers-reduced-motion the homepage must contribute zero running
 *    or pending animations; normal-motion durations stay untouched.
 */

const globalsCssPath = 'app/globals.css';
const homepageV2CssPath =
  'components/marketing/homepage-v2/HomepageV2Route.css';
const layoutShellPath =
  'components/features/profile/templates/PublicProfileLayoutShell.tsx';

describe('JOV-4932 /new defect contracts', () => {
  it('scopes every profile-viewport document lock to non-embedded surfaces', () => {
    const css = readFileSync(resolve(process.cwd(), globalsCssPath), 'utf8');
    const lockSelectors = css
      .split('\n')
      .filter(line => /(?:html|body):has\(\.profile-viewport\)/.test(line));

    expect(
      lockSelectors.length,
      'expected the html/body profile-viewport locks to exist'
    ).toBeGreaterThanOrEqual(4);
    for (const selector of lockSelectors) {
      expect(
        selector,
        `${selector.trim()} must skip embedded previews`
      ).toContain(':not(:has(.profile-viewport--embedded))');
    }
  });

  it('marks embedded profile previews on the layout shell', () => {
    const source = readFileSync(
      resolve(process.cwd(), layoutShellPath),
      'utf8'
    );
    expect(source).toContain('profile-viewport--embedded');
  });

  it('spans the canonical pricing row across the shared shell grid', () => {
    const css = readFileSync(resolve(process.cwd(), homepageV2CssPath), 'utf8');
    expect(css).toMatch(
      /\[data-testid="homepage-v2-pricing"\] \.system-b-mounted-home-pricing-plans \{\s*grid-column: 1 \/ -1;/
    );
  });

  it('contributes zero running or pending animations under reduced motion', () => {
    const css = readFileSync(resolve(process.cwd(), homepageV2CssPath), 'utf8');

    const blockStart = css.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(
      blockStart,
      'reduced-motion block exists in HomepageV2Route.css'
    ).toBeGreaterThanOrEqual(0);
    const block = css.slice(blockStart);

    expect(block).toContain('.homepage-v2-hero__phone-float');
    expect(block).toContain('.homepage-v2-hero__shot');
    expect(block).toContain('animation: none');
  });
});
