#!/usr/bin/env tsx
/**
 * Bring production to the crawl content fixture
 * (`lib/synthetic/crawl-content-fixture.json`) and write a
 * `jovie.crawl-content-fixture-receipt/v1`.
 *
 *   doppler run -p jovie-web -c prd -- pnpm --filter @jovie/web \
 *     crawl-fixture:reconcile                    # dry run: plan only, reads only
 *   ... crawl-fixture:reconcile --apply          # converge, then check pages
 *
 * Apply writes only fixture-owned rows, then loads the three public pages on
 * --origin and fails unless each answers 200. Dry run never fetches the pages
 * (a 404 fetched before the rows exist would sit in the page cache).
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  CRAWL_CONTENT_FIXTURE,
  CRAWL_CONTENT_FIXTURE_RECEIPT_SCHEMA,
  CRAWL_CONTENT_FIXTURE_SCHEMA,
  type CrawlContentFixtureReceipt,
  type CrawlContentPageCheck,
  crawlContentFixturePaths,
} from '@/lib/synthetic/crawl-content-fixture';
import { reconcileCrawlContentFixture } from '@/lib/synthetic/crawl-content-fixture.server';

const HTTP_TIMEOUT_MS = 20_000;
const PAGE_ATTEMPTS = 8;
const PAGE_RETRY_MS = 45_000;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function checkPage(
  origin: string,
  path: string
): Promise<CrawlContentPageCheck> {
  let status: number | null = null;
  for (let attempt = 1; attempt <= PAGE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(new URL(path, origin), {
        redirect: 'manual',
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      });
      status = response.status;
    } catch {
      status = null;
    }
    if (status === 200) return { path, status, attempts: attempt, ok: true };
    // A just-created page can serve a cached 404 for one revalidate window.
    if (attempt < PAGE_ATTEMPTS) await wait(PAGE_RETRY_MS);
  }
  return { path, status, attempts: PAGE_ATTEMPTS, ok: false };
}

async function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      origin: { type: 'string', default: 'https://jov.ie' },
      receipt: { type: 'string' },
    },
  });
  const apply = values.apply === true;
  const origin = values.origin as string;
  const startedAt = new Date().toISOString();

  const { steps, converged } = await reconcileCrawlContentFixture({ apply });
  const pages = apply
    ? await Promise.all(
        Object.values(crawlContentFixturePaths()).map(path =>
          checkPage(origin, path)
        )
      )
    : [];

  const receipt: CrawlContentFixtureReceipt = {
    schema: CRAWL_CONTENT_FIXTURE_RECEIPT_SCHEMA,
    fixtureSchema: CRAWL_CONTENT_FIXTURE_SCHEMA,
    fixtureVersion: CRAWL_CONTENT_FIXTURE.version,
    mode: apply ? 'apply' : 'dry-run',
    origin,
    startedAt,
    endedAt: new Date().toISOString(),
    handle: CRAWL_CONTENT_FIXTURE.handle,
    steps,
    pages,
    converged: converged && pages.every(page => page.ok),
  };
  const text = JSON.stringify(receipt, null, 2);
  if (values.receipt) writeFileSync(values.receipt, `${text}\n`);
  process.stdout.write(`${text}\n`);
  if (apply && !receipt.converged) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch(error => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exit(1);
  });
