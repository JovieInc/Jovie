import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';

/**
 * Sidebar optical alignment ratchet (JOV-8346, JOV-5865).
 *
 * Shared primitives own the column. A private px-2.5, 18px grid, or 26px
 * row on a shell owner is a regression. The count may only go down, and the
 * armed floor is zero after the column converged.
 */

const appRoot = resolve(__dirname, '../../..');
const BASELINE_PATH = resolve(
  __dirname,
  'sidebar-optical-alignment.baseline.json'
);

const OWNERS = [
  'components/shell/sidebar-optical.ts',
  'components/shell/SidebarNavItem.tsx',
  'components/shell/SidebarThreadsSection.tsx',
  'components/shell/SidebarSection.tsx',
  'components/shell/HeaderSearchSurfaceFromContext.tsx',
  'components/organisms/sidebar/menu.tsx',
  'components/organisms/sidebar/layout.tsx',
  'components/organisms/sidebar/group.tsx',
  'components/organisms/DesktopTitlebar.tsx',
  'components/organisms/UnifiedSidebar.tsx',
  'components/organisms/sidebar-identity-group/SidebarIdentityGroup.tsx',
  'components/organisms/SidebarCollapsibleGroup.tsx',
  'components/organisms/operator-navigation.ts',
] as const;

const BANNED = [
  /(?<![\w-])px-2\.5(?![\w-])/,
  /(?<![\w-])pl-2\.5(?![\w-])/,
  /(?<![\w-])pr-2\.5(?![\w-])/,
  /(?<![\w-])gap-2\.5(?![\w-])/,
  /(?<![\w-])gap-x-2\.5(?![\w-])/,
  /(?<![\w-])gap-x-1\.5(?![\w-])/,
  /(?<![\w-])mx-2\.5(?![\w-])/,
  /(?<![\w-])right-2\.5(?![\w-])/,
  /grid-cols-\[18px/,
  /grid-cols-\[22px/,
  /(?<![\w-])h-6\.5(?![\w-])/,
] as const;

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function countBanned(source: string): number {
  const code = stripComments(source);
  let count = 0;
  for (const pattern of BANNED) {
    count += code.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
  }
  return count;
}

describe('sidebar optical alignment ratchet (shrink-only)', () => {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
    armed: boolean;
    count: number;
  };
  const measured = OWNERS.reduce((sum, file) => {
    return sum + countBanned(readFileSync(resolve(appRoot, file), 'utf8'));
  }, 0);

  it('is armed at a floor that only goes down', () => {
    expect(baseline.armed).toBe(true);
    const verdict = evaluateShrinkOnlyCount({
      count: measured,
      baseline: baseline.count,
      metric: 'sidebar optical one-off offsets',
    });
    if (!verdict.ok && verdict.status === 'regression') {
      expect.fail(
        `${verdict.message} Use the shared sidebar optical tokens instead of a private offset.`
      );
    }
    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower count in sidebar-optical-alignment.baseline.json to ${measured}.`
      );
    }
    expect(verdict.ok).toBe(true);
    expect(measured).toBe(0);
  });

  it('keeps history on the nav grid and the rail at 224px', () => {
    const css = readFileSync(
      resolve(appRoot, 'styles/design-system.css'),
      'utf8'
    );
    expect(css).toMatch(/--app-shell-sidebar-width:\s*224px;/);
    expect(css).toMatch(
      /--app-shell-sidebar-history-grid:\s*var\(--app-shell-sidebar-nav-grid\);/
    );
    expect(css).toMatch(
      /--app-shell-sidebar-nav-grid:\s*var\(--app-shell-sidebar-icon-size\)\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*auto\);/
    );
  });

  it('keeps the Electron titlebar on flex with a calculated traffic-light reserve', () => {
    const css = readFileSync(resolve(appRoot, 'app/globals.css'), 'utf8');
    expect(css).toMatch(
      /\[data-electron-titlebar="true"\] \{[^}]*display:\s*flex;/s
    );
    expect(css).toMatch(/--electron-traffic-light-safe-width:\s*calc\(/);
    expect(css).not.toMatch(/--electron-traffic-light-safe-width:\s*\d+px;/);
    expect(css).not.toMatch(
      /grid-template-columns:\s*var\(--electron-sidebar-width\)/
    );
    expect(css).not.toMatch(
      /grid-template-columns:\s*var\(--linear-app-sidebar-width\)/
    );
    expect(css).toMatch(
      /width:\s*calc\(var\(--app-shell-gap\)\s*\+\s*var\(--electron-sidebar-width\)\);/
    );
  });
});
