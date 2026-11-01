import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * JOV-10246: the public profile's release artwork is the LCP element. With
 * the ISR document arriving fast, every client module in the hydration tree
 * runs ahead of that paint on throttled mobile. These islands render nothing
 * on first paint, so they must stay lazy.
 */
const WEB_ROOT = path.resolve(__dirname, '../../..');
const read = (file: string) => readFileSync(path.join(WEB_ROOT, file), 'utf8');

const staticImport = (source: string, specifier: string) =>
  new RegExp(
    `^import [^;]*from '${specifier.replace(/[/.]/g, '\\$&')}';`,
    'm'
  ).test(source);

describe('public profile entry bundle (JOV-10246)', () => {
  const page = read('app/[username]/page.tsx');
  const template = read(
    'components/features/profile/templates/ProfileCompactTemplate.tsx'
  );
  const islands = read(
    'components/features/profile/ProfileDeferredIslands.tsx'
  );

  it.each([
    '@/features/profile/ProfileViewTracker',
    '@/features/tracking/SignupFunnelBeacon',
    '@/features/tracking/JoviePixel',
    '@/features/tracking/MetaPixel',
    '@/components/features/profile/AliasCollisionRecovery',
  ])('keeps %s out of the page entry and lazy without SSR', specifier => {
    expect(staticImport(page, specifier)).toBe(false);
    expect(islands).toContain(`import('${specifier}')`);
  });

  it('defers every island without server rendering', () => {
    expect(islands.match(/dynamic\(/g) ?? []).toHaveLength(5);
    expect(islands.match(/\{ ssr: false \}/g) ?? []).toHaveLength(5);
  });

  it('lazy-loads the credits drawer after first open and the desktop surface', () => {
    expect(
      staticImport(template, '@/features/release/ReleaseCreditsDrawer')
    ).toBe(false);
    expect(staticImport(template, './ProfileDesktopSurface')).toBe(false);
    expect(template).toContain(
      "import('@/features/release/ReleaseCreditsDrawer')"
    );
    expect(template).toContain("import('./ProfileDesktopSurface')");
    expect(template.match(/creditsEverOpened \? \(/g) ?? []).toHaveLength(2);
  });
});
