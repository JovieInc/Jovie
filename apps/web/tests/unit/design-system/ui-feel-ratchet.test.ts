/**
 * Deterministic UI-feel ratchet (JOV-3371).
 *
 * Machine-checkable subset of the make-it-feel-better skill:
 * - will-change: all banned in production app sources
 * - skill file present and loadable by agents
 * - cinematic reveal tokens present on sidebar + audio bar (JOV-3487)
 *
 * Counts may only stay flat or go down when scanning for anti-patterns.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(__dirname, '../../..');
const repoRoot = path.resolve(webRoot, '../..');

const WILL_CHANGE_ALL = /will-change\s*:\s*all\b|will-change-\[all\]/i;
const PRODUCTION_GLOBS = [
  path.join(webRoot, 'app'),
  path.join(webRoot, 'components'),
  path.join(webRoot, 'styles'),
];

function walkTsxCss(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (
      entry === 'node_modules' ||
      entry === '.next' ||
      entry.startsWith('.') ||
      entry.includes('.test.') ||
      entry.includes('.spec.') ||
      entry.includes('.stories.')
    ) {
      continue;
    }
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkTsxCss(full, out);
      continue;
    }
    if (/\.(tsx|ts|css)$/.test(entry)) out.push(full);
  }
  return out;
}

function countWillChangeAll(): { count: number; files: string[] } {
  const files: string[] = [];
  let count = 0;
  for (const root of PRODUCTION_GLOBS) {
    for (const file of walkTsxCss(root)) {
      const source = readFileSync(file, 'utf8');
      const matches = source.match(new RegExp(WILL_CHANGE_ALL.source, 'gi'));
      if (matches?.length) {
        count += matches.length;
        files.push(path.relative(webRoot, file));
      }
    }
  }
  return { count, files };
}

describe('UI-feel deterministic ratchet (JOV-3371)', () => {
  it('make-it-feel-better skill is present for agents', () => {
    const skillPath = path.join(
      repoRoot,
      '.claude/skills/make-it-feel-better/SKILL.md'
    );
    expect(existsSync(skillPath), skillPath).toBe(true);
    const body = readFileSync(skillPath, 'utf8');
    expect(body).toContain('name: make-it-feel-better');
    expect(body).toContain('transition: all');
    expect(body).toContain('tabular-nums');
    expect(body).toContain('will-change');
  });

  it(
    'will-change: all count is zero (shrink-only floor)',
    () => {
      const { count, files } = countWillChangeAll();
      expect(count, `will-change: all found in:\n${files.join('\n')}`).toBe(0);
    },
    30_000
  );

  it('sidebar + audio bar use cinematic reveal tokens (JOV-3487)', () => {
    const targets = [
      'components/organisms/sidebar/sidebar.tsx',
      'components/organisms/PersistentAudioBar.tsx',
      'components/organisms/UnifiedSidebar.tsx',
    ];
    for (const rel of targets) {
      const source = readFileSync(path.join(webRoot, rel), 'utf8');
      expect(source, rel).toMatch(/duration-cinematic/);
      expect(source, rel).toMatch(/ease-cinematic/);
    }
  });
});
