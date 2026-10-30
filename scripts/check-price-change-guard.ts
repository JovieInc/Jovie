/**
 * CI guard: an existing plan's live price may not change without a previously
 * merged scheduled-change record whose notice window has run.
 *
 * Usage: tsx scripts/check-price-change-guard.ts [--base origin/main] [--today YYYY-MM-DD]
 * See apps/web/lib/billing/price-changes/guard.ts for the invariant.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { evaluatePriceChangeGuard } from '../apps/web/lib/billing/price-changes/guard.ts';
import {
  extractLivePrices,
  LIVE_PRICE_SOURCE_FILES,
  type LivePriceSources,
} from '../apps/web/lib/billing/price-changes/live-prices.ts';
import { SCHEDULED_PRICE_CHANGES } from '../apps/web/lib/billing/price-changes/registry.ts';
import type { ScheduledPriceChange } from '../apps/web/lib/billing/price-changes/types.ts';

const REGISTRY_PATH = 'apps/web/lib/billing/price-changes/registry.ts';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index > -1 ? (process.argv[index + 1] ?? fallback) : fallback;
}

function gitShow(ref: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${path}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

async function loadBaseRecords(ref: string): Promise<ScheduledPriceChange[]> {
  const source = gitShow(ref, REGISTRY_PATH);
  if (source === null) return [];
  const dir = mkdtempSync(join(tmpdir(), 'price-guard-'));
  try {
    const file = join(dir, 'registry.mts');
    writeFileSync(file, source);
    const mod = (await import(pathToFileURL(file).href)) as {
      SCHEDULED_PRICE_CHANGES: ScheduledPriceChange[];
    };
    return [...mod.SCHEDULED_PRICE_CHANGES];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  const base = arg('--base', 'origin/main');
  const today = arg('--today', new Date().toISOString().slice(0, 10));
  const headSources = {} as Record<string, string>;
  const baseSources = {} as Record<string, string>;
  for (const [name, path] of Object.entries(LIVE_PRICE_SOURCE_FILES)) {
    headSources[name] = readFileSync(path, 'utf8');
    const baseText = gitShow(base, path);
    if (baseText === null) {
      console.error(`price-change-guard: cannot read ${path} at ${base}`);
      return 2;
    }
    baseSources[name] = baseText;
  }
  const violations = evaluatePriceChangeGuard({
    baseLive: extractLivePrices(baseSources as unknown as LivePriceSources),
    headLive: extractLivePrices(headSources as unknown as LivePriceSources),
    baseRecords: await loadBaseRecords(base),
    headRecords: SCHEDULED_PRICE_CHANGES,
    today,
  });
  if (violations.length === 0) {
    console.log(`price-change-guard: ok (base ${base}, ${today})`);
    return 0;
  }
  console.error('price-change-guard: FAILED');
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error(
    '\nA price for an existing plan changes only through a scheduled-change record merged at least 30 days earlier. See apps/web/lib/billing/price-changes/README.md.'
  );
  return 1;
}

main()
  .then(code => process.exit(code))
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : 'price guard failed'
    );
    process.exit(2);
  });
