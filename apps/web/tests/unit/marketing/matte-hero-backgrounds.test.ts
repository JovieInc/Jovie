import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Marketing heroes sit on the matte page background (Tim, 2026-10-29). The
 * saturated per-route hero photographs (`MarketingHeroPhoto`,
 * `/images/marketing-hero/*`) are gone and must not come back.
 */
const WEB_ROOT = join(__dirname, '../../..');
const ROOTS = ['app', 'components', 'features', 'data', 'content', 'lib'];
const SKIP_DIRS = new Set(['node_modules', '.next']);
const SOURCE = /\.(?:ts|tsx|js|jsx|css)$/;
const TEST_FILE = /\.(?:test|spec)\.[jt]sx?$/;
const HERO_PHOTO =
  /MarketingHeroPhoto|\/images\/marketing-hero\/|marketing-hero-photo/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SOURCE.test(name) && !TEST_FILE.test(name)) out.push(full);
  }
}

describe('matte marketing hero backgrounds', () => {
  it('renders no per-route hero photograph anywhere in the web app', () => {
    const files: string[] = [];
    for (const root of ROOTS) walk(join(WEB_ROOT, root), files);
    const offenders = files
      .filter(file => HERO_PHOTO.test(readFileSync(file, 'utf8')))
      .map(file => relative(WEB_ROOT, file).split(sep).join('/'))
      .sort();
    expect(offenders).toEqual([]);
  });

  it('ships no hero photograph component or assets', () => {
    expect(
      existsSync(join(WEB_ROOT, 'components/marketing/MarketingHeroPhoto.tsx'))
    ).toBe(false);
    expect(existsSync(join(WEB_ROOT, 'public/images/marketing-hero'))).toBe(
      false
    );
  });
});
