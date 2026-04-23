import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const FIXTURE_PATHS = [
  'components/features/demo/demo-fixtures.ts',
  'components/features/home/featured-creators-fallback.ts',
  'components/features/home/HomeSandboxCard.tsx',
  'components/features/home/StickyPhoneTour.tsx',
  'components/features/home/StickyPhoneTourClient.tsx',
  'components/features/home/demo/mock-data.ts',
  'components/features/home/homepage-profile-preview-fixture.ts',
] as const;

const APP_ROOT = resolve(import.meta.dirname, '../../..');

function readFixture(relativePath: string) {
  return readFileSync(resolve(APP_ROOT, relativePath), 'utf8');
}

describe('Tim White marketing fixtures', () => {
  it('scrubs fake Afterglow titles from owned marketing and demo fixtures', () => {
    for (const path of FIXTURE_PATHS) {
      const source = readFixture(path);
      expect(source).not.toContain('Afterglow (Deluxe)');
      expect(source).not.toContain('Afterglow Tour');
    }
  });

  it('uses /tim for visible marketing shortlinks instead of /timwhite', () => {
    const sandboxSource = readFixture(
      'components/features/home/HomeSandboxCard.tsx'
    );
    expect(sandboxSource).not.toContain('jov.ie/timwhite');
    expect(sandboxSource).toContain('jov.ie/tim');

    for (const path of [
      'components/features/home/StickyPhoneTour.tsx',
      'components/features/home/StickyPhoneTourClient.tsx',
    ] as const) {
      const source = readFixture(path);
      expect(source).not.toContain("artistHandle = 'timwhite'");
      expect(source).toContain("artistHandle = 'tim'");
    }
  });
});
