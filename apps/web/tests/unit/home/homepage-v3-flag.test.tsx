// The v3 homepage is dark-launched: HOMEPAGE_V3_ENABLED is a build-time
// constant that is off by default, so the live `/` is unchanged until flip.
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

  it('is off unless NEXT_PUBLIC_FEATURE_HOMEPAGE_V3 is 1 or true', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_HOMEPAGE_V3', '');
    expect((await import('@/lib/flags/homepage-v3')).HOMEPAGE_V3_ENABLED).toBe(
      false
    );
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_HOMEPAGE_V3', '1');
    expect((await import('@/lib/flags/homepage-v3')).HOMEPAGE_V3_ENABLED).toBe(
      true
    );
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_FEATURE_HOMEPAGE_V3', 'true');
    expect((await import('@/lib/flags/homepage-v3')).HOMEPAGE_V3_ENABLED).toBe(
      true
    );
  });

  it('switches only the hero and shell, keeping the live path intact', () => {
    const page = read('app/(home)/page.tsx');
    const hero = page.slice(
      page.indexOf('function HomepageHero()'),
      page.indexOf('function HomepageUnlockedSections()')
    );
    expect(hero).toMatch(
      /if \(HOMEPAGE_V3_ENABLED\) \{\s*return <HomepageIdentityHero headingId='home-hero-heading' \/>;/
    );
    expect(hero).toContain('<HomepageEditorialHero');

    const layout = read('app/(home)/layout.tsx');
    const v3 = layout.slice(
      layout.indexOf('if (HOMEPAGE_V3_ENABLED)'),
      layout.indexOf('// The homepage uses the canonical marketing shell.')
    );
    // v3 uses the default landing header (docked) and the full footer.
    expect(v3).not.toContain('headerVariant=');
    expect(v3).not.toContain('mainOffset={false}');
    expect(v3).toContain("footerVariant='expanded'");
    expect(v3).not.toContain('HomeScrollWatcher');
  });
});
