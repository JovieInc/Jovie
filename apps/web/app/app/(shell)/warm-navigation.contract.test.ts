import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const shellDirectory = dirname(fileURLToPath(import.meta.url));
const warmNavigationLoadingBoundaries = [
  'loading.tsx',
  'chat/loading.tsx',
  'chat/[id]/loading.tsx',
  'calendar/loading.tsx',
  'contacts/loading.tsx',
  'library/loading.tsx',
  'tasks/loading.tsx',
  'settings/loading.tsx',
  'settings/account/loading.tsx',
  'settings/appearance/loading.tsx',
  'settings/artist-profile/loading.tsx',
  'settings/audience/loading.tsx',
  'settings/billing/loading.tsx',
  'settings/contacts/loading.tsx',
  'settings/retargeting-ads/loading.tsx',
  'settings/touring/loading.tsx',
] as const;
const shellLayout = readFileSync(join(shellDirectory, 'layout.tsx'), 'utf8');

describe('authenticated shell warm navigation contract', () => {
  it('does not install a loading boundary that replaces primary customer routes during warm navigation', () => {
    // In the App Router, a segment loading.tsx becomes the immediate fallback
    // for navigation into that segment. Keeping this file absent lets the
    // current authenticated route remain visible until the destination RSC
    // payload is ready instead of flashing a route-shaped skeleton.
    for (const relativePath of warmNavigationLoadingBoundaries) {
      expect(
        existsSync(join(shellDirectory, relativePath)),
        `${relativePath} should not replace a warm authenticated route`
      ).toBe(false);
    }
  });

  it('retains the layout-owned first authenticated boot fallback', () => {
    expect(shellLayout).toContain('const shellFallback = (');
    expect(shellLayout).toContain('<AppShellSkeleton');
    expect(shellLayout).toContain('<Suspense fallback={shellFallback}>');
  });
});
