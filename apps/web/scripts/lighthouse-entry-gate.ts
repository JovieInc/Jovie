/**
 * Throttled-mobile LCP gate for the artist golden-path entry routes.
 *
 * Why this exists: the Playwright budget guard measures unthrottled, warmed
 * Chromium, so it passed `/start` at 1.3s while Lighthouse mobile (simulated
 * slow 4G, 4x CPU) measured 8.4s on production, 2026-10-25. This gate runs
 * Lighthouse with the default mobile profile, takes the median of N runs and
 * fails when any route is over its budget. It replaces the unthrottled
 * `/start` budget; do not keep both.
 *
 * Budgets live in `performance-entry-budgets.json`. Ratchet `lcpMs` down when
 * the measured median is comfortably under it; never loosen it.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface EntryRouteBudget {
  readonly id: string;
  /** Path template; `[handle]` is replaced by `--handle`. */
  readonly path: string;
  readonly lcpMs: number;
  readonly cls: number;
}

export interface EntryRouteResult {
  readonly id: string;
  readonly url: string;
  readonly lcpSamples: readonly number[];
  readonly clsSamples: readonly number[];
}

export interface EntryRouteVerdict {
  readonly id: string;
  readonly url: string;
  readonly lcpMedianMs: number;
  readonly clsMedian: number;
  readonly lcpBudgetMs: number;
  readonly clsBudget: number;
  readonly pass: boolean;
  readonly failures: readonly string[];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function resolveRoutePath(template: string, handle: string): string {
  return template.replaceAll('[handle]', encodeURIComponent(handle));
}

/** Pure verdict: a route with no samples fails closed. */
export function evaluateEntryRoute(
  budget: EntryRouteBudget,
  result: EntryRouteResult
): EntryRouteVerdict {
  const lcpMedianMs = median(result.lcpSamples);
  const clsMedian = median(result.clsSamples);
  const failures: string[] = [];
  if (!Number.isFinite(lcpMedianMs)) {
    failures.push('no LCP samples were collected');
  } else if (lcpMedianMs > budget.lcpMs) {
    failures.push(
      `LCP median ${Math.round(lcpMedianMs)}ms > ${budget.lcpMs}ms budget`
    );
  }
  if (!Number.isFinite(clsMedian)) {
    failures.push('no CLS samples were collected');
  } else if (clsMedian > budget.cls) {
    failures.push(`CLS median ${clsMedian.toFixed(3)} > ${budget.cls} budget`);
  }
  return {
    id: budget.id,
    url: result.url,
    lcpMedianMs,
    clsMedian,
    lcpBudgetMs: budget.lcpMs,
    clsBudget: budget.cls,
    pass: failures.length === 0,
    failures,
  };
}

export function parseBudgets(raw: unknown): EntryRouteBudget[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TypeError('entry budgets must be a non-empty array');
  }
  return raw.map((item, index) => {
    const row = item as Partial<EntryRouteBudget>;
    if (
      typeof row.id !== 'string' ||
      typeof row.path !== 'string' ||
      !row.path.startsWith('/') ||
      typeof row.lcpMs !== 'number' ||
      !(row.lcpMs > 0) ||
      typeof row.cls !== 'number' ||
      !(row.cls >= 0)
    ) {
      throw new TypeError(`entry budget ${index} is malformed`);
    }
    return { id: row.id, path: row.path, lcpMs: row.lcpMs, cls: row.cls };
  });
}

function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function runLighthouse(
  url: string,
  headersFile: string | null,
  outFile: string
): { lcp: number; cls: number } {
  const require = createRequire(import.meta.url);
  const lhciDir = path.dirname(require.resolve('@lhci/cli/package.json'));
  const cli = require.resolve('lighthouse/cli/index.js', { paths: [lhciDir] });
  const args = [
    cli,
    url,
    '--form-factor=mobile',
    '--only-categories=performance',
    '--output=json',
    `--output-path=${outFile}`,
    '--quiet',
    '--chrome-flags=--headless=new --no-sandbox --disable-dev-shm-usage',
  ];
  if (headersFile) args.push(`--extra-headers=${headersFile}`);
  const run = spawnSync(process.execPath, args, {
    stdio: ['ignore', 'ignore', 'inherit'],
    timeout: 180_000,
  });
  if (run.status !== 0) throw new Error(`lighthouse failed for ${url}`);
  const report = JSON.parse(readFileSync(outFile, 'utf8')) as {
    audits: Record<string, { numericValue?: number }>;
  };
  const lcp = report.audits['largest-contentful-paint']?.numericValue;
  const cls = report.audits['cumulative-layout-shift']?.numericValue;
  if (typeof lcp !== 'number' || typeof cls !== 'number') {
    throw new Error(`lighthouse produced no LCP/CLS for ${url}`);
  }
  return { lcp, cls };
}

export async function main(argv: readonly string[]): Promise<number> {
  const baseUrl = argValue(argv, '--base-url');
  if (!baseUrl) throw new Error('--base-url is required');
  const handle = argValue(argv, '--handle') ?? 'tim';
  const runs = Number(argValue(argv, '--runs') ?? '3');
  const only = argv.flatMap((value, index) =>
    value === '--route-id' ? [argv[index + 1]] : []
  );
  const here = path.dirname(fileURLToPath(import.meta.url));
  const budgets = parseBudgets(
    JSON.parse(
      readFileSync(path.join(here, '..', 'performance-entry-budgets.json'), {
        encoding: 'utf8',
      })
    )
  ).filter(budget => only.length === 0 || only.includes(budget.id));
  if (budgets.length === 0) throw new Error('no entry routes selected');

  const work = mkdtempSync(path.join(tmpdir(), 'entry-lh-'));
  let headersFile: string | null = null;
  const bypass = process.env.PLAYWRIGHT_VERCEL_BYPASS_SECRET;
  if (bypass) {
    headersFile = path.join(work, 'headers.json');
    writeFileSync(
      headersFile,
      JSON.stringify({
        'x-vercel-protection-bypass': bypass,
        'x-vercel-set-bypass-cookie': 'true',
      }),
      { mode: 0o600 }
    );
  }
  const verdicts: EntryRouteVerdict[] = [];
  try {
    for (const budget of budgets) {
      const url = new URL(
        resolveRoutePath(budget.path, handle),
        baseUrl
      ).toString();
      const lcpSamples: number[] = [];
      const clsSamples: number[] = [];
      for (let run = 0; run < runs; run++) {
        const sample = runLighthouse(
          url,
          headersFile,
          path.join(work, `${budget.id}-${run}.json`)
        );
        lcpSamples.push(sample.lcp);
        clsSamples.push(sample.cls);
        console.log(
          `  ${budget.id} sample ${run + 1}/${runs}: LCP ${Math.round(sample.lcp)}ms CLS ${sample.cls.toFixed(3)}`
        );
      }
      verdicts.push(
        evaluateEntryRoute(budget, {
          id: budget.id,
          url,
          lcpSamples,
          clsSamples,
        })
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  for (const verdict of verdicts) {
    console.log(
      `${verdict.pass ? 'PASS' : 'FAIL'} ${verdict.id}: LCP ${Math.round(verdict.lcpMedianMs)}ms / ${verdict.lcpBudgetMs}ms, CLS ${verdict.clsMedian.toFixed(3)} / ${verdict.clsBudget}`
    );
    for (const failure of verdict.failures) console.log(`  ${failure}`);
  }
  return verdicts.every(verdict => verdict.pass) ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(
    code => process.exit(code),
    error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(2);
    }
  );
}
