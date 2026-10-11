import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateShrinkOnlyCount } from '@/lib/design/shrink-only-count-ratchet';

/**
 * `--linear-*` namespace shrink-only ratchet (JOV #12009 / #10158).
 *
 * Five token namespaces coexist (`--color/--linear/--ds/--app-shell/
 * --public-shell`). The `--linear-*` namespace is DEPRECATED: canonical
 * values live in `design/tokens.json` (compiled by
 * `scripts/build-design-tokens.mjs`), and consumers migrate to the semantic
 * namespace wave by wave.
 *
 * This ratchet counts every `--linear-` occurrence across live web source
 * (app/, components/, styles/, tailwind.config.js). The count may only go
 * DOWN. When you migrate consumers, lower `count` in
 * linear-namespace.baseline.json in the same PR so the floor follows the
 * work down.
 *
 * Unbaselined shrink fail-closes on local / pull_request authorship, but only
 * when this tree authored the shrink: merge_group's sibling-shrink leniency
 * can land a removal with the floor left stale on main, and an unrelated
 * branch must not fail qualification for debt it inherited (JOV-5326). The
 * merge-base count is recovered from the base→worktree diff so the base tree
 * never needs scanning; when no base resolves the check stays fail-closed.
 * Native merge_group must pass so a sibling's token removal cannot
 * UNMERGEABLE a source-green changelog/UI PR (JOV-5300). Growth still fails
 * every event.
 *
 * Pattern mirrors arbitrary-values-ratchet.test.ts (baseline JSON + source
 * scan; shrink-only) plus the shared merge-group-safe count policy.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
// tests/unit/design-system → repo root
const REPO_ROOT = join(WEB_ROOT, '..', '..');
const BASELINE_PATH = join(__dirname, 'linear-namespace.baseline.json');

const LINEAR_VAR = /--linear-[a-z0-9-]+/g;
const SOURCE_EXT = /\.(tsx|ts|css)$/;
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'generated']);
const SCANNED_ROOTS = ['app', 'components', 'styles'] as const;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry) && !/\.test\.[tj]sx?$/.test(entry)) {
      out.push(full);
    }
  }
}

export function countLinearNamespaceUsage(): {
  count: number;
  perFile: Map<string, number>;
} {
  const files: string[] = [];
  for (const dir of SCANNED_ROOTS) {
    walk(join(WEB_ROOT, dir), files);
  }
  const tailwindConfig = join(WEB_ROOT, 'tailwind.config.js');
  if (existsSync(tailwindConfig)) files.push(tailwindConfig);

  let count = 0;
  const perFile = new Map<string, number>();
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(LINEAR_VAR);
    if (matches && matches.length > 0) {
      count += matches.length;
      perFile.set(relative(WEB_ROOT, file), matches.length);
    }
  }
  return { count, perFile };
}

/** Repo-relative path that the filesystem scan above would include. */
function isScannedLinearFile(repoRelativePath: string): boolean {
  if (repoRelativePath === 'apps/web/tailwind.config.js') return true;
  if (
    !SCANNED_ROOTS.some(dir => repoRelativePath.startsWith(`apps/web/${dir}/`))
  ) {
    return false;
  }
  if (!SOURCE_EXT.test(repoRelativePath)) return false;
  if (/\.test\.[tj]sx?$/.test(repoRelativePath)) return false;
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
  // actions/checkout on pull_request materializes an ephemeral merge commit:
  // HEAD^1 is the base tip when no base ref resolves.
  if (tryGit(['rev-parse', '--verify', 'HEAD^2'])) {
    return tryGit(['rev-parse', 'HEAD^1']);
  }
  return undefined;
}

/**
 * --linear-* count at the tree's merge-base, recovered from the base→worktree
 * diff (`removed - added` per scanned file) instead of rescanning the base.
 * `undefined` when no base resolves — the verdict then stays fail-closed.
 */
export function countLinearNamespaceAtMergeBase(
  liveCount: number
): number | undefined {
  const base = resolveMergeBase();
  if (!base) return undefined;
  const diff = tryGit([
    'diff',
    '--unified=0',
    base,
    '--',
    ...SCANNED_ROOTS.map(dir => `apps/web/${dir}`),
    'apps/web/tailwind.config.js',
  ]);
  if (diff === undefined) return undefined;

  let removed = 0;
  let added = 0;
  let minusScanned = false;
  let plusScanned = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('--- ')) {
      const file = line.slice(4).replace(/^a\//, '');
      minusScanned = file !== '/dev/null' && isScannedLinearFile(file);
      continue;
    }
    if (line.startsWith('+++ ')) {
      const file = line.slice(4).replace(/^b\//, '');
      plusScanned = file !== '/dev/null' && isScannedLinearFile(file);
      continue;
    }
    if (line.startsWith('-') && minusScanned) {
      removed += (line.match(LINEAR_VAR) ?? []).length;
    } else if (line.startsWith('+') && plusScanned) {
      added += (line.match(LINEAR_VAR) ?? []).length;
    }
  }
  return liveCount + removed - added;
}

describe('--linear-* namespace ratchet (shrink-only)', () => {
  // Source walk of app/components/styles exceeds the 5s local budget.
  it('does not add new --linear-* usage beyond the baseline', {
    timeout: 15_000,
  }, () => {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };
    const { count, perFile } = countLinearNamespaceUsage();
    const verdict = evaluateShrinkOnlyCount({
      count,
      baseline: baseline.count,
      baseCount: countLinearNamespaceAtMergeBase(count),
      metric: '--linear-* usage',
    });

    if (!verdict.ok && verdict.status === 'regression') {
      const top = [...perFile.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([file, n]) => `  ${file}: ${n}`)
        .join('\n');
      expect.fail(
        `--linear-* usage grew: ${count} > baseline ${baseline.count}. ` +
          `The --linear-* namespace is deprecated (JOV #12009) — use the ` +
          `semantic tokens from design/tokens.json instead.\nTop files:\n${top}`
      );
    }

    if (!verdict.ok) {
      expect.fail(
        `${verdict.message} Lower "count" in linear-namespace.baseline.json ` +
          `to ${count} in this PR.`
      );
    }

    expect(verdict.ok).toBe(true);
    expect(count).toBeLessThanOrEqual(baseline.count);
  });
});
