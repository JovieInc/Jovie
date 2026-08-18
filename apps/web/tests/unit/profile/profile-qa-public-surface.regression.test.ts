import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = resolve(__dirname, '../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(webRoot, relativePath), 'utf8');
}

describe('public profile QA regressions', () => {
  it('keeps the compact hero location from collapsing to two letters', () => {
    // Regression: ISSUE-003 — compact hero truncated location to "Lo..."
    // Found by /qa on 2026-08-17
    // Report: .gstack/qa-reports/qa-report-localhost-3100-2026-08-17.md
    const source = readRepoFile(
      'components/features/profile/templates/ProfileCompactSurface.tsx'
    );
    expect(source).toContain("className='shrink-0 whitespace-nowrap'");
    expect(source).toContain('{locationLabel}');
  });

  it('reserves extra tab-bar clearance so Music rows are not clipped', () => {
    // Regression: ISSUE-001 — last Music rows sat under the floating tab bar
    // Found by /qa on 2026-08-17
    // Report: .gstack/qa-reports/qa-report-localhost-3100-2026-08-17.md
    const source = readRepoFile('styles/design-system.css');
    expect(source).toMatch(
      /--profile-bottom-nav-height:[\s\S]*var\(--space-8\)/
    );
  });

  it('colors AEO body links with System B tokens instead of browser purple', () => {
    // Regression: ISSUE-005 — FAQ/AEO mention links rendered default purple
    // Found by /qa on 2026-08-17
    // Report: .gstack/qa-reports/qa-report-localhost-3100-2026-08-17.md
    const source = readRepoFile('styles/design-system.css');
    expect(source).toContain(
      '.profile-aeo-content__body .profile-entity-mention'
    );
    expect(source).toContain('color: var(--profile-aeo-text);');
    expect(source).toContain(
      'color: var(--jovie-entity-accent, var(--profile-aeo-text, inherit));'
    );
  });
});
