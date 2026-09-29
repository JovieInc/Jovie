import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Banned icon guard (Tim, 2026-09-25, product-wide).
 *
 * Lucide's vinyl/record family (`Disc`, `Disc2`, `Disc3`, `DiscAlbum`) and the
 * dot-in-circle status glyph (`CircleDot`) are banned everywhere in apps/web:
 *   - Record icons: replace with `AudioLines` (tracks/audio) or `Layers`
 *     (release type) depending on context.
 *   - `CircleDot`: replace with `CircleCheck` (approved/released, success
 *     color), `CircleDashed` (draft), or `CircleX` (error).
 *
 * This is a cheap, whole-file text scan (no AST) so it stays fast and catches
 * every vector actually used in this codebase: a direct `lucide-react`
 * import, a JSX tag, an object/array icon reference, and the string-literal
 * indirection through the shared `Icon` wrapper (`<Icon name="Disc3" />`,
 * `icon: 'Disc3'`, `iconName: 'Disc3'`). Tests and fixtures are excluded —
 * banning covers what actually ships.
 */

const WEB_ROOT = process.cwd();

const SKIP: RegExp[] = [
  /\/tests\//,
  /\/node_modules\//,
  /\/\.next\//,
  /\/\.turbo\//,
  /\.test\.[tj]sx?$/,
  /\.stories\.[tj]sx?$/,
];

const BANNED_ICONS = [
  'Disc',
  'Disc2',
  'Disc3',
  'DiscAlbum',
  'CircleDot',
] as const;

// Whole-word match only — must not fire on `discNumber`, `totalDiscs`,
// "Disc Two Intro" style track-title fixtures (excluded via /tests/ anyway),
// or any other identifier that merely contains one of these names.
const BANNED_ICON_PATTERN = new RegExp(
  `\\b(?:${BANNED_ICONS.join('|')})\\b`,
  'g'
);

function walk(dir: string, exts: readonly string[]): string[] {
  const out: string[] = [];
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (SKIP.some(rx => rx.test(full))) continue;
    if (entry.isDirectory()) {
      out.push(...walk(full, exts));
    } else if (exts.some(ext => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

function rel(file: string): string {
  return relative(WEB_ROOT, file);
}

function findBannedIconHits(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const matches = text.match(BANNED_ICON_PATTERN);
  return matches ? [...new Set(matches)] : [];
}

describe('banned icons — vinyl/record and dot-in-circle status (2026-09-25)', () => {
  it('no apps/web source file imports or references a banned icon name', () => {
    const files = walk(WEB_ROOT, ['.ts', '.tsx']);
    const offenders: string[] = [];

    for (const file of files) {
      const hits = findBannedIconHits(file);
      if (hits.length > 0) {
        offenders.push(`${rel(file)}: ${hits.join(', ')}`);
      }
    }

    expect(
      offenders,
      `Banned icon(s) found. Replace record icons (Disc/Disc2/Disc3/DiscAlbum) ` +
        `with AudioLines (tracks/audio) or Layers (release type); replace ` +
        `CircleDot with CircleCheck/CircleDashed/CircleX by status.\n` +
        offenders.join('\n')
    ).toEqual([]);
    // Sync walk+read of every .ts/.tsx under apps/web: <1s idle, but the
    // default 12s budget fired under full-suite shard CPU contention.
  }, 45_000);

  it('the shared Icon registry does not re-admit a banned icon', () => {
    const iconTsx = readFileSync(
      join(WEB_ROOT, 'components/atoms/Icon.tsx'),
      'utf8'
    );
    for (const banned of BANNED_ICONS) {
      expect(
        new RegExp(`\\b${banned}\\b`).test(iconTsx),
        `Icon.tsx registry must not include ${banned}`
      ).toBe(false);
    }
  });
});
