import {
  execFileSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Design-system drift ratchet.
 *
 * Counts arbitrary Tailwind values (`w-[327px]`, `text-[#fff]`,
 * `data-[state=open]:…`) across the web surfaces. The count may only go
 * DOWN: every wave that converges screens onto the canonical Jovie Design
 * System tokens removes arbitrary values, never adds them.
 *
 * Why a ratchet and not zero-tolerance: there are ~6.6k existing arbitrary
 * values; banning them outright would block all work. The ratchet locks in
 * progress — regressions fail CI, improvements pass. PRs compare against the
 * current base branch so cleanup waves do not fight over one shared counter.
 * The committed JSON is only a local fallback when git base history is absent.
 *
 * Pattern mirrors apps/web/scripts/seo-ratchet-guard.mjs (baseline JSON +
 * source-text guard).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const BASELINE_PATH = join(__dirname, 'arbitrary-values.baseline.json');

// Tailwind arbitrary value: a utility/variant chain ending in `-[…]`.
// The `-[` signature avoids array-index false positives (`items[i]`).
const ARBITRARY = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
const SOURCE_EXT = /\.(tsx|ts)$/;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
}

function countArbitraryValues(root = WEB_ROOT): number {
  const files: string[] = [];
  for (const dir of ['components', 'app'].map(d => join(root, d))) {
    walk(dir, files);
  }
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(ARBITRARY);
    if (matches) total += matches.length;
  }
  return total;
}

function git(args: readonly string[], cwd = REPO_ROOT): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 60_000,
  }).trim();
}

function resolveBaseRef(): string | null {
  const baseBranch =
    process.env.MERGE_BASE_REF ?? process.env.GITHUB_BASE_REF ?? 'main';
  const remoteRef = `origin/${baseBranch}`;
  try {
    git(['rev-parse', '--verify', remoteRef]);
    return remoteRef;
  } catch {
    try {
      git(['fetch', 'origin', baseBranch, '--depth=1']);
      git(['rev-parse', '--verify', remoteRef]);
      return remoteRef;
    } catch {
      return null;
    }
  }
}

function countBaseArbitraryValues(): {
  readonly ref: string;
  readonly count: number;
} | null {
  const baseRef = resolveBaseRef();
  if (!baseRef) return null;

  const tempRoot = mkdtempSync(join(tmpdir(), 'jovie-arbitrary-base-'));
  const worktree = join(tempRoot, 'worktree');
  try {
    git(['worktree', 'add', '--detach', worktree, baseRef]);
    return {
      ref: baseRef,
      count: countArbitraryValues(join(worktree, 'apps', 'web')),
    };
  } catch {
    return null;
  } finally {
    try {
      git(['worktree', 'remove', '--force', worktree]);
    } catch {
      // Best-effort cleanup; rmSync handles partial worktree setup.
    }
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

describe('design-system arbitrary-value ratchet', () => {
  it('arbitrary Tailwind values do not increase above the baseline', () => {
    const current = countArbitraryValues();
    const base = countBaseArbitraryValues();

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };
    const limit = base?.count ?? baseline.count;
    const label = base ? `current base ${base.ref}` : 'fallback baseline';

    expect(
      current,
      `Arbitrary Tailwind values rose to ${current} (${label}: ${limit}). ` +
        'Use design-system tokens instead of arbitrary values, or justify the new arbitrary value in review.'
    ).toBeLessThanOrEqual(limit);
  });
});
