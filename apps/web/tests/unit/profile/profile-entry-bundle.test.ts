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
  const islands = read('app/[username]/_components/ProfileDeferredIslands.tsx');

  it.each([
    '@/features/profile/ProfileViewTracker',
    '@/features/tracking/SignupFunnelBeacon',
    '@/features/tracking/JoviePixel',
    '@/features/tracking/MetaPixel',
  ])(
    'keeps artist-paid tracking %s in the page entry, never lazy',
    specifier => {
      expect(staticImport(page, specifier)).toBe(true);
      expect(islands).not.toContain(`import('${specifier}')`);
    }
  );

  it('defers only the alias-collision recovery island without SSR', () => {
    expect(
      staticImport(page, '@/components/features/profile/AliasCollisionRecovery')
    ).toBe(false);
    expect(islands).toContain(
      "import('@/components/features/profile/AliasCollisionRecovery')"
    );
    expect(islands.match(/dynamic\(/g) ?? []).toHaveLength(1);
    expect(islands.match(/\{ ssr: false \}/g) ?? []).toHaveLength(1);
  });
});
