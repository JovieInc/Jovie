import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..'
);

const ROOTS = ['components', join('app', 'app')];
const OWNER = 'components/atoms/PlayIcon.tsx';
// TrackSidebar.tsx is open in #24746; convert its play glyph once it merges.
const ALLOW = new Set([
  'components/organisms/release-sidebar/TrackSidebar.tsx',
]);
const INLINE_NUDGE = /<Play\b[^>]*translate-x/s;

function walk(dir: string, out: string[]) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(path, out);
    } else if (
      name.endsWith('.tsx') &&
      !name.includes('.test.') &&
      !name.includes('.stories.')
    ) {
      out.push(path);
    }
  }
  return out;
}

describe('play glyph contract (JOV-12568)', () => {
  it('keeps the play triangle optical offset inside PlayIcon only', () => {
    const offenders = ROOTS.flatMap(root => walk(join(WEB_ROOT, root), []))
      .map(path => relative(WEB_ROOT, path).split('\\').join('/'))
      .filter(path => path !== OWNER && !ALLOW.has(path))
      .filter(path =>
        INLINE_NUDGE.test(readFileSync(join(WEB_ROOT, path), 'utf8'))
      );

    expect(offenders).toEqual([]);
  });

  it('owns the 1px nudge in the primitive', () => {
    expect(readFileSync(join(WEB_ROOT, OWNER), 'utf8')).toContain(
      "'translate-x-px'"
    );
  });
});
