// The v3 homepage is live (Tim 2026-09-28): HOMEPAGE_V3_ENABLED is a
// build-time constant that is on unless explicitly rolled back with 0/false.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('homepage v3 dark-launch flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ['', true],
    ['1', true],
    ['true', true],
    ['0', false],
    ['false', false],
  ])('NEXT_PUBLIC_FEATURE_HOMEPAGE_V3=%j resolves to %s', async (value, on) => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_HOMEPAGE_V3', value);
    expect((await import('@/lib/flags/homepage-v3')).HOMEPAGE_V3_ENABLED).toBe(
      on
    );
  });

  it('switches only the story stack, keeping the live hero and shell intact', () => {
    const page = read('app/(home)/page.tsx');
    const hero = page.slice(
      page.indexOf('function HomepageHero()'),
      page.indexOf('function HomepageUnlockedSections()')
    );
    // The identity hero shipped live: it renders unconditionally, flag or not.
    expect(hero).not.toContain('HOMEPAGE_V3_ENABLED');
    expect(hero).toContain(
      "return <HomepageIdentityHero headingId='home-hero-heading' />"
    );

    // The flag gates only the v3 body (presence, structure, close).
    expect(page).toContain('HOMEPAGE_V3_ENABLED ? (');
    expect(page).toContain('<HomepageIdentityStoryStack />');
    expect(page).toContain('<HomepageStoryStack />');

    // One canonical shell: the layout no longer branches on the flag.
    const layout = read('app/(home)/layout.tsx');
    expect(layout).not.toContain('HOMEPAGE_V3_ENABLED');
    expect(layout).toContain("footerVariant='expanded'");
  });
});
