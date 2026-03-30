import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Route completeness guard.
 *
 * Every directory under the app shell that has a `loading.tsx` MUST also have
 * a `page.tsx` (or `page.ts`). Otherwise Next.js shows the loading skeleton
 * forever — the page never resolves.
 *
 * Routes that are intentionally deferred (no backend yet, redundant, etc.)
 * go in EXPECTED_SKELETON_ONLY with a reason. The test also fails if a route
 * in the allowlist gains a page — forces cleanup so the list stays honest.
 */

const SHELL_ROOT = path.resolve(__dirname, '../../../app/app/(shell)');

/**
 * Intentionally deferred routes — loading skeleton exists but page is not
 * implemented yet. Each entry MUST have a reason.
 */
const EXPECTED_SKELETON_ONLY: Record<string, string> = {
  // Layout-level loading shells (no page.tsx by design — sub-routes handle content)
  dashboard: 'layout loading shell, sub-routes have pages',
  settings: 'layout loading shell, sub-routes have pages',

  // No backend implemented yet
  'settings/branding': 'no backend, deferred',
  'settings/appearance': 'no backend, deferred',
  'settings/notifications': 'no backend, deferred',
  'settings/remove-branding': 'premium feature, no backend',

  // Redundant with existing pages
  'settings/profile': 'redundant with /settings/artist-profile',
  'dashboard/overview': 'chat is the home page now',
  'dashboard/profile': 'integrated into chat',
  'dashboard/tipping': 'redirect to earnings, loading skeleton for transition',
  'dashboard/contacts': 'managed via /settings/contacts',
  'dashboard/tour-dates': 'managed via /settings/touring',
  'dashboard/links':
    'managed via chat page GroupedLinksManager; standalone page needs preview panel context refactor',
  'settings/retargeting-ads':
    'admin-only retargeting attribution dashboard, deferred',
};

function findLoadingDirs(dir: string, base: string = ''): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  const hasLoading = entries.some(
    e => e.isFile() && (e.name === 'loading.tsx' || e.name === 'loading.ts')
  );

  if (hasLoading) {
    results.push(base);
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const childPath = path.join(dir, entry.name);
      const childBase = base ? `${base}/${entry.name}` : entry.name;
      results.push(...findLoadingDirs(childPath, childBase));
    }
  }

  return results;
}

function hasPage(dir: string, relativePath: string): boolean {
  const fullDir = path.join(dir, relativePath);
  try {
    const entries = fs.readdirSync(fullDir);
    return entries.some(
      name =>
        name === 'page.tsx' ||
        name === 'page.ts' ||
        name === 'page.jsx' ||
        name === 'page.js'
    );
  } catch {
    return false;
  }
}

describe('route completeness', () => {
  const loadingDirs = findLoadingDirs(SHELL_ROOT);

  it('every loading.tsx should have a matching page.tsx (or be in the allowlist)', () => {
    const orphaned: string[] = [];

    for (const dir of loadingDirs) {
      if (dir in EXPECTED_SKELETON_ONLY) continue;
      if (!hasPage(SHELL_ROOT, dir)) {
        orphaned.push(dir);
      }
    }

    if (orphaned.length > 0) {
      const list = orphaned.map(d => `  - ${d}`).join('\n');
      expect.fail(
        `Found ${orphaned.length} route(s) with loading.tsx but no page.tsx:\n${list}\n\n` +
          'Either implement the page or add the route to EXPECTED_SKELETON_ONLY with a reason.'
      );
    }
  });

  it('allowlisted routes should NOT have a page.tsx (clean up the allowlist)', () => {
    const stale: string[] = [];

    for (const route of Object.keys(EXPECTED_SKELETON_ONLY)) {
      if (hasPage(SHELL_ROOT, route)) {
        stale.push(route);
      }
    }

    if (stale.length > 0) {
      const list = stale.map(d => `  - ${d}`).join('\n');
      expect.fail(
        `Found ${stale.length} allowlisted route(s) that now have a page.tsx — remove from EXPECTED_SKELETON_ONLY:\n${list}`
      );
    }
  });
});
