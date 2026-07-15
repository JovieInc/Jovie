import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
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
 * progress — regressions fail CI, improvements pass. When you reduce the
 * count, lower `count` in arbitrary-values.baseline.json in the same PR so
 * the floor follows the work down.
 *
 * Pattern mirrors apps/web/scripts/seo-ratchet-guard.mjs (baseline JSON +
 * source-text guard).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/unit/design-system → apps/web
const WEB_ROOT = join(__dirname, '..', '..', '..');
const SCAN_DIRS = ['components', 'app'] as const;
const BASELINE_PATH = join(__dirname, 'arbitrary-values.baseline.json');

// Tailwind arbitrary value: a utility/variant chain ending in `-[…]`.
// The `-[` signature avoids array-index false positives (`items[i]`).
const ARBITRARY = /\b[a-z][a-z0-9]*(?:-[a-z0-9]+)*-\[[^\]]+\]/gi;
const SOURCE_EXT = /\.(tsx|ts)$/;
const TRUSTED_RIPGREP_PATHS = [
  '/usr/bin/rg',
  '/usr/local/bin/rg',
  '/opt/homebrew/bin/rg',
] as const;

interface RipgrepResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly error?: Error;
}

type RipgrepRunner = (scanRoot: string) => RipgrepResult;

function walk(dir: string, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(full);
    }
  }
}

function walkAllSourceFiles(scanRoot: string): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walk(join(scanRoot, dir), files);
  return files.sort((a, b) => a.localeCompare(b));
}

function resolveTrustedRipgrepPath(): string | null {
  return TRUSTED_RIPGREP_PATHS.find(path => existsSync(path)) ?? null;
}

function runRipgrepCandidates(scanRoot: string): RipgrepResult {
  const ripgrepPath = resolveTrustedRipgrepPath();
  if (!ripgrepPath) {
    return {
      status: null,
      stdout: '',
      error: new Error('No trusted ripgrep binary found'),
    };
  }

  const result = spawnSync(
    ripgrepPath,
    [
      '--files-with-matches',
      '--sort',
      'path',
      '--null',
      '--hidden',
      '--no-messages',
      '--no-ignore',
      '--glob',
      '*.ts',
      '--glob',
      '*.tsx',
      '--glob',
      '!**/node_modules/**',
      '--glob',
      '!**/.next/**',
      '--fixed-strings',
      '--regexp',
      '-[',
      ...SCAN_DIRS,
    ],
    {
      cwd: scanRoot,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 5_000,
    }
  );

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    error: result.error,
  };
}

/**
 * Every ARBITRARY match contains the literal `-[`. Let native ripgrep select
 * that conservative superset, then keep the JavaScript regex as the sole
 * counter. Exit 1 is ripgrep's successful no-match result. Any missing or
 * failed binary falls back to the complete walker, so the optimization cannot
 * hide a design-system regression.
 */
function findArbitraryValueSourceFiles(
  scanRoot: string,
  runner: RipgrepRunner = runRipgrepCandidates
): string[] {
  const result = runner(scanRoot);
  if (!result.error && result.status === 1) return [];
  if (result.error || result.status !== 0) return walkAllSourceFiles(scanRoot);

  return [...new Set(result.stdout.split('\0').filter(Boolean))]
    .map(file => join(scanRoot, file))
    .sort((a, b) => a.localeCompare(b));
}

function countArbitraryValues(
  scanRoot = WEB_ROOT,
  runner?: RipgrepRunner
): number {
  const files = findArbitraryValueSourceFiles(scanRoot, runner);
  let total = 0;
  for (const file of files) {
    const matches = readFileSync(file, 'utf8').match(ARBITRARY);
    if (matches) total += matches.length;
  }
  return total;
}

describe('design-system arbitrary-value ratchet', () => {
  it('arbitrary Tailwind values do not increase above the baseline', () => {
    const current = countArbitraryValues();

    // Self-seed on first run so the baseline and the count logic can never
    // diverge. Commit the seeded file; CI compares against it.
    if (!existsSync(BASELINE_PATH)) {
      writeFileSync(
        BASELINE_PATH,
        `${JSON.stringify({ count: current, note: 'Arbitrary Tailwind values in apps/web/{components,app}. Ratchet only goes down — lower this when a PR reduces the count.' }, null, 2)}\n`
      );
    }

    const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as {
      count: number;
    };

    expect(
      current,
      `Arbitrary Tailwind values rose to ${current} (baseline ${baseline.count}). ` +
        'Use design-system tokens instead of arbitrary values, or — if this is intentional — justify it in review.'
    ).toBeLessThanOrEqual(baseline.count);
  });
});

describe('arbitrary-value source prefilter', () => {
  it('preserves exact regex counts and falls back completely on rg errors', () => {
    const scanRoot = mkdtempSync(join(tmpdir(), 'arbitrary-values-ratchet-'));
    const result =
      (status: number | null, stdout = '', error?: Error): RipgrepRunner =>
      () => ({ status, stdout, error });

    try {
      mkdirSync(join(scanRoot, 'app'), { recursive: true });
      mkdirSync(join(scanRoot, 'components', 'node_modules'), {
        recursive: true,
      });
      writeFileSync(
        join(scanRoot, 'app', 'multiline.tsx'),
        'const classes = "w-[calc(100%\n-1rem)] text-[#fff]";\n'
      );
      writeFileSync(
        join(scanRoot, 'components', 'uppercase.ts'),
        'const className = "W-[20px]";\n'
      );
      writeFileSync(
        join(scanRoot, 'components', 'candidate-only.ts'),
        'const marker = "-[";\n'
      );
      writeFileSync(
        join(scanRoot, 'components', 'clean.tsx'),
        'const className = "w-full";\n'
      );
      writeFileSync(
        join(scanRoot, 'components', 'node_modules', 'ignored.ts'),
        'const className = "w-[999px]";\n'
      );

      const candidates = result(
        0,
        'components/uppercase.ts\0components/candidate-only.ts\0app/multiline.tsx\0'
      );
      const fallback = result(2);
      const spawnError = result(null, '', new Error('spawnSync rg ENOENT'));

      expect(findArbitraryValueSourceFiles(scanRoot, candidates)).toEqual([
        join(scanRoot, 'app', 'multiline.tsx'),
        join(scanRoot, 'components', 'candidate-only.ts'),
        join(scanRoot, 'components', 'uppercase.ts'),
      ]);
      expect(findArbitraryValueSourceFiles(scanRoot, fallback)).toHaveLength(4);
      expect(findArbitraryValueSourceFiles(scanRoot, result(1))).toEqual([]);

      expect(countArbitraryValues(scanRoot, candidates)).toBe(3);
      expect(countArbitraryValues(scanRoot, fallback)).toBe(3);
      expect(countArbitraryValues(scanRoot, spawnError)).toBe(3);
      expect(countArbitraryValues(scanRoot)).toBe(3);
    } finally {
      rmSync(scanRoot, { recursive: true, force: true });
    }
  });
});
