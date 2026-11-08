import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';

/**
 * All-caps UI text ratchet (ASR-022, Tim 2026-11-08: "caps lock should be
 * banned").
 *
 * Counts every `uppercase` styling token in live web source: the Tailwind
 * `uppercase` utility, CSS `text-transform: uppercase`, and inline
 * `textTransform: 'uppercase'`. Comment lines are ignored. The count may
 * only go DOWN: new all-caps labels, eyebrows and badges fail here. When you
 * remove one, lower `count` in no-uppercase.baseline.json in the same PR.
 *
 * Artist and release names are data and keep the artist's own spelling; this
 * ratchet only bans the UI forcing text into capitals.
 *
 * Same shrink-only policy and merge-base attribution as
 * linear-namespace-ratchet.test.ts.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const BASELINE_PATH = join(__dirname, 'no-uppercase.baseline.json');

const UPPERCASE_TOKEN = /(?<![\w-])uppercase(?![\w-])/g;
const SOURCE_EXT = /\.(tsx|ts|css)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'generated']);
const SCANNED_ROOTS = ['app', 'components', 'styles'] as const;
const NON_UI_FILE = /\.(test|spec|stories)\.[tj]sx?$/;

function isCommentLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith('*') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/*')
  );
}

export function countUppercaseInLine(line: string): number {
  if (isCommentLine(line)) return 0;
  return (line.match(UPPERCASE_TOKEN) ?? []).length;
}

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry) && !NON_UI_FILE.test(entry)) {
      out.push(full);
    }
  }
}

export function countUppercaseUsage(): {
  count: number;
  perFile: Map<string, number>;
} {
  const files: string[] = [];
  for (const dir of SCANNED_ROOTS) walk(join(WEB_ROOT, dir), files);
  let count = 0;
  const perFile = new Map<string, number>();
  for (const file of files) {
    let n = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      n += countUppercaseInLine(line);
    }
    if (n > 0) {
      count += n;
      perFile.set(relative(WEB_ROOT, file), n);
    }
  }
  return { count, perFile };
}

function isScannedFile(repoRelativePath: string): boolean {
  if (
    !SCANNED_ROOTS.some(dir => repoRelativePath.startsWith(`apps/web/${dir}/`))
  ) {
    return false;
  }
  if (!SOURCE_EXT.test(repoRelativePath)) return false;
  if (NON_UI_FILE.test(repoRelativePath)) return false;
  return !repoRelativePath.split('/').some(segment => SKIP_DIRS.has(segment));
}

function tryGit(args: string[]): string | undefined {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return undefined;
  }
}

function resolveMergeBase(): string | undefined {
  const refs = [
    process.env.AUTOMATION_VERIFY_BASE,
    process.env.GITHUB_BASE_REF && `origin/${process.env.GITHUB_BASE_REF}`,
    'origin/main',
  ].filter((ref): ref is string => Boolean(ref));
  for (const ref of new Set(refs)) {
    const base = tryGit(['merge-base', 'HEAD', ref]);
    if (base) return base;
  }
  if (tryGit(['rev-parse', '--verify', 'HEAD^2'])) {
    return tryGit(['rev-parse', 'HEAD^1']);
  }
  return undefined;
}

/** Count at the merge-base, recovered from the base→worktree diff. */
function countUppercaseAtMergeBase(liveCount: number): number | undefined {
  const base = resolveMergeBase();
  if (!base) return undefined;
  const diff = tryGit([
    'diff',
    '--unified=0',
    base,
    '--',
    ...SCANNED_ROOTS.map(dir => `apps/web/${dir}`),
  ]);
  if (diff === undefined) return undefined;
  let removed = 0;
  let added = 0;
  let minusScanned = false;
  let plusScanned = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) {
      const file = line.slice(4).replace(/^a\//, '');
      minusScanned = file !== '/dev/null' && isScannedFile(file);
      continue;
    }
    if (line.startsWith('+++ ')) {
      const file = line.slice(4).replace(/^b\//, '');
      plusScanned = file !== '/dev/null' && isScannedFile(file);
      continue;
    }
    if (line.startsWith('-') && minusScanned) {
      removed += countUppercaseInLine(line.slice(1));
    } else if (line.startsWith('+') && plusScanned) {
      added += countUppercaseInLine(line.slice(1));
    }
  }
  return liveCount + removed - added;
}

describe('all-caps UI text ratchet (shrink-only)', () => {
  it('counts the utility, CSS and inline forms but not comments', () => {
    expect(countUppercaseInLine("className='text-xs uppercase'")).toBe(1);
    expect(countUppercaseInLine('  text-transform: uppercase;')).toBe(1);
    expect(countUppercaseInLine("style={{ textTransform: 'uppercase' }}")).toBe(
      1
    );
    expect(countUppercaseInLine(' * uppercase is banned')).toBe(0);
    expect(countUppercaseInLine('value.toUpperCase()')).toBe(0);
    expect(countUppercaseInLine("className='not-uppercase-x'")).toBe(0);
  });

  it('does not add new all-caps styling beyond the baseline', {
    timeout: 15_000,
  }, () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };
    const { count, perFile } = countUppercaseUsage();
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: baseline.count,
      baseCount: countUppercaseAtMergeBase(count),
      metric: 'all-caps UI styling',
    });
    if (!verdict.ok && verdict.status === 'regression') {
      const top = [...perFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, n]) => `  ${file}: ${n}`)
        .join('\n');
      expect.fail(
        `All-caps UI styling grew: ${count} > baseline ${baseline.count}. ` +
          'Caps lock is banned (ASR-022): use Title Case labels and sentence ' +
          `case copy instead of uppercase.\nTop files:\n${top}`
      );
    }
    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower "count" in no-uppercase.baseline.json ` +
          `to ${count} in this PR.`
      );
    }
    expect(count).toBeLessThanOrEqual(baseline.count);
  });
});
