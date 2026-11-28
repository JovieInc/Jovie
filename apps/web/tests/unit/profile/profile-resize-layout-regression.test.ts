import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();
const CSS = readFileSync(join(WEB_ROOT, 'styles/design-system.css'), 'utf8');
const read = (path: string) => readFileSync(join(WEB_ROOT, path), 'utf8');

function rule(selector: string): string {
  const start = CSS.indexOf(`${selector} {`);
  expect(start, `missing rule ${selector}`).toBeGreaterThan(-1);
  return CSS.slice(start, CSS.indexOf('\n}', start));
}

describe('jov.ie/tim resize regressions', () => {
  it('anchors the cover accent line to the stage top, not a % of its height', () => {
    // At md+ the stage height follows content, so a percentage `top` moved
    // the line across the identity / Get Updates row on every resize.
    const block = rule('.profile-cover-accent-line');
    expect(block).toMatch(/top:\s*0;/);
    expect(block).not.toMatch(/%/);
  });

  it('no longer draws a blue line along the desktop hero card edge', () => {
    expect(
      read('components/features/profile/templates/ProfileDesktopSurface.tsx')
    ).not.toContain('profile-desktop-cover-accent-line');
  });

  it('keeps the mobile home rail content-sized so nothing opens a gap above the footer', () => {
    const start = CSS.indexOf('Mobile home: the identity header and the rail');
    const block = CSS.slice(start, start + 1200);
    const railRule = block.slice(block.indexOf('profile-home-rail'));
    expect(railRule).toMatch(/flex:\s*0 1 auto;/);
    expect(railRule.slice(0, 300)).not.toMatch(/flex:\s*1 1 0%;/);
  });

  it('reserves the dock plus the 44px claim bar and its 12px gap', () => {
    expect(CSS).toMatch(
      /:root:has\(\[data-testid="profile-proof-claim-bar"\]\)[\s\S]{0,260}56px/
    );
    expect(
      read('components/features/profile/templates/ProfileCompactSurface.tsx')
    ).toContain('pointer-events-auto mb-3 md:hidden');
  });

  it('draws the featured card accent as one hue of light, not a wash', () => {
    const start = CSS.indexOf(':where(.profile-mode-card)::before {');
    const block = CSS.slice(start, CSS.indexOf('\n}', start));
    expect(block.match(/radial-gradient\(/g)).toHaveLength(1);
    expect(block).toContain('var(--space-px) no-repeat');
    expect(block).not.toMatch(/0% 100%/);
  });

  it('shows desktop tab focus rings for :focus-visible only', () => {
    const surface = read(
      'components/features/profile/templates/ProfileDesktopSurface.tsx'
    );
    expect(surface).toContain('focus-visible:ring-2 focus-visible:ring-focus');
    expect(surface).toContain('[&:focus:not(:focus-visible)]:shadow-none');
  });
});
