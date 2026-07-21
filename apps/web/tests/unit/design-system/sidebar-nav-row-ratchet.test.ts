import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Hand-rolled shell sidebar nav-row drift ratchet.
 *
 * Flags inline nav-row class strings that duplicate the canonical shell chrome
 * (`getSidebarNavRowClassName` / `SidebarNavItem`) instead of importing the
 * helper. The count may only go DOWN.
 *
 * ERROR mode (promoted from warn, JOV-3584 → #12025): the baseline converged
 * to 0 — every shell nav-row surface consumes the canonical helper — so new
 * hand-rolled rows now fail CI outright.
 *
 * Sibling of component-family-ratchet.test.ts / raw-button-ratchet.test.ts.
 */

const WARN_ONLY = false;

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['components', 'app'].map(directory =>
  join(WEB_ROOT, directory)
);
const BASELINE_PATH = join(__dirname, 'sidebar-nav-row.baseline.json');

const CANONICAL_HELPER_IMPORT = /getSidebarNavRowClassName/;

// Distinct hand-rolled settings/sidebar nav row signature from JOV-3584.
const HAND_ROLLED_SETTINGS_NAV_ROW =
  /['"`]flex min-h-7 items-center rounded-full px-2\.5 py-1/g;

// Broader shell nav-row chrome duplicated outside the helper.
const HAND_ROLLED_SHELL_NAV_ROW =
  /(?:className=\{cn\(|className=['"`])[^;]*?(?:flex|grid)[^'"]*?(?:min-h-7|h-7)[^'"]*?rounded-full[^'"]*?px-2\.5/g;

const SOURCE_EXT = /\.(tsx|ts)$/;

const ALLOWLIST = new Set([
  'components/organisms/sidebar/menu.tsx',
  'components/organisms/sidebar/group.tsx',
  'components/molecules/tab-bar/TabBar.tsx',
  'components/molecules/drawer/DrawerCardActionBar.tsx',
  'components/organisms/UnifiedSidebar.tsx',
  'components/features/dashboard/organisms/SettingsTouringSection.tsx',
  'components/features/dashboard/organisms/releases/cells/SmartLinkCell.tsx',
  'app/app/(shell)/threads/ThreadsPageClient.tsx',
]);

function walk(directory: string, output: string[]): void {
  if (!existsSync(directory)) return;

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(fullPath, output);
      continue;
    }

    if (SOURCE_EXT.test(entry)) {
      output.push(fullPath);
    }
  }
}

function countHandRolledNavRows(): number {
  const files: string[] = [];
  for (const directory of SCAN_DIRS) walk(directory, files);

  let total = 0;

  for (const file of files) {
    const relativePath = relative(WEB_ROOT, file);
    if (ALLOWLIST.has(relativePath)) continue;

    const content = readFileSync(file, 'utf8');
    if (CANONICAL_HELPER_IMPORT.test(content)) continue;

    const settingsMatches = content.match(HAND_ROLLED_SETTINGS_NAV_ROW);
    const shellMatches = content.match(HAND_ROLLED_SHELL_NAV_ROW);

    total += (settingsMatches?.length ?? 0) + (shellMatches?.length ?? 0);
  }

  return total;
}

describe('design-system sidebar-nav-row ratchet', () => {
  it('hand-rolled shell nav rows do not grow above the baseline', () => {
    const current = countHandRolledNavRows();

    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify(
          {
            count: current,
            note:
              'Hand-rolled shell sidebar nav-row class strings in apps/web/{components,app} ' +
              'outside getSidebarNavRowClassName(). Ratchet only goes down — lower when you ' +
              'migrate offenders to SidebarNavItem helpers. Error mode: regressions fail CI.',
          },
          null,
          2
        )}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    if (current > baseline.count) {
      const message =
        `Hand-rolled sidebar nav-row styling rose to ${current} (baseline ${baseline.count}). ` +
        'Use getSidebarNavRowClassName() / SidebarNavItem instead of inline nav-row classes. ' +
        'If this is a genuinely distinct surface, add it to the allowlist with a Linear ID.';

      if (WARN_ONLY) {
        console.warn(`[sidebar-nav-row ratchet — WARN] ${message}`);
      } else {
        expect.fail(message);
      }
    }

    expect(current).toBeLessThanOrEqual(baseline.count);
  });
});
