#!/usr/bin/env tsx
/**
 * SEO + agent-readiness + copy certification sweep over live public pages.
 *
 *   tsx scripts/seo-certify.ts --base https://jov.ie \
 *     [--is-agentic-report is-agentic.json] [--max-pages 400] \
 *     [--out seo-certification.json] [--ratchet]
 *
 * Reads the sitemap, fetches each HTML page, runs lib/seo/page-certification,
 * and writes a `jovie.seo-certification/v1` report whose per-page receipts use
 * the certification kernel envelope. `--ratchet` exits 1 when any check fails
 * on more pages than seo-certification-ratchet.json allows (regressions only;
 * the known backlog stays advisory and is filed in Linear with label `seo`).
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  auditIsAgentic,
  certifyPage,
  IS_AGENTIC_SCORE_FLOOR,
  parseIsAgenticReport,
  SEO_CERTIFICATION_CONTRACT,
  type SeoCheck,
  type SeoPageCertification,
  toCertificationReceipts,
} from '@/lib/seo/page-certification';

const USER_AGENT =
  'Mozilla/5.0 (compatible; JovieSeoCertification/1.0; +https://jov.ie)';
const TIMEOUT_MS = 20_000;
const CONCURRENCY = 6;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const RATCHET_PATH = join(
  SCRIPT_DIR,
  '..',
  'lib',
  'seo',
  'seo-certification-ratchet.json'
);

export interface SeoCertificationReport {
  readonly contract: typeof SEO_CERTIFICATION_CONTRACT;
  readonly generatedAt: string;
  readonly base: string;
  readonly sourceSha: string | null;
  readonly site: { readonly checks: readonly SeoCheck[] };
  readonly summary: {
    readonly pages: number;
    readonly passed: number;
    readonly failed: number;
    readonly failuresByCheck: Readonly<Record<string, number>>;
    readonly warningsByCheck: Readonly<Record<string, number>>;
  };
  readonly pages: ReadonlyArray<
    SeoPageCertification & {
      readonly receipts: ReturnType<typeof toCertificationReceipts>;
    }
  >;
}

export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(
    match => match[1] ?? ''
  );
}

/** `User-agent: *` Disallow prefixes (wildcard patterns are skipped). */
export function parseRobotsDisallow(robots: string): string[] {
  const disallow: string[] = [];
  let inWildcardGroup = false;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split('#')[0]?.trim() ?? '';
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') inWildcardGroup = value === '*';
    else if (
      key === 'disallow' &&
      inWildcardGroup &&
      value &&
      !value.includes('*')
    )
      disallow.push(value);
  }
  return disallow;
}

export function summarize(
  pages: readonly SeoPageCertification[]
): SeoCertificationReport['summary'] {
  const failuresByCheck: Record<string, number> = {};
  const warningsByCheck: Record<string, number> = {};
  for (const page of pages) {
    for (const item of page.checks) {
      const bucket =
        item.status === 'failed'
          ? failuresByCheck
          : item.status === 'warn'
            ? warningsByCheck
            : null;
      if (bucket) bucket[item.id] = (bucket[item.id] ?? 0) + 1;
    }
  }
  const passed = pages.filter(page => page.passed).length;
  return {
    pages: pages.length,
    passed,
    failed: pages.length - passed,
    failuresByCheck,
    warningsByCheck,
  };
}

/** Checks that fail on more pages than the ratchet allows. */
export function ratchetRegressions(
  failuresByCheck: Readonly<Record<string, number>>,
  allowed: Readonly<Record<string, number>>
): string[] {
  return Object.entries(failuresByCheck)
    .filter(([id, count]) => count > (allowed[id] ?? 0))
    .map(
      ([id, count]) => `${id}: ${count} failing (allowed ${allowed[id] ?? 0})`
    );
}

interface FetchedText {
  readonly status: number;
  readonly body: string;
  readonly contentType: string;
  readonly xRobotsTag: string | null;
}

async function fetchText(
  url: string,
  fetchImpl: typeof globalThis.fetch
): Promise<FetchedText> {
  const response = await fetchImpl(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,*/*' },
    redirect: 'manual',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type') ?? '',
    xRobotsTag: response.headers.get('x-robots-tag'),
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index] as T);
      }
    })
  );
  return results;
}

export function renderMarkdown(report: SeoCertificationReport): string {
  const lines = [
    `## SEO certification: ${report.summary.passed}/${report.summary.pages} pages pass`,
    '',
    ...report.site.checks
      .filter(item => item.status !== 'warn')
      .map(item => `- site \`${item.id}\` ${item.status}: ${item.summary}`),
    '',
    '| Failing check | Pages |',
    '| --- | --- |',
    ...Object.entries(report.summary.failuresByCheck)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => `| ${id} | ${count} |`),
  ];
  return `${lines.join('\n')}\n`;
}

export interface SweepOptions {
  readonly base: string;
  readonly maxPages?: number;
  readonly isAgenticRaw?: unknown;
  readonly sourceSha?: string | null;
  readonly ref?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
}

export async function runSweep({
  base: rawBase,
  maxPages = 400,
  isAgenticRaw = null,
  sourceSha = null,
  ref = 'local',
  fetchImpl = globalThis.fetch,
}: SweepOptions): Promise<SeoCertificationReport> {
  const base = new URL(rawBase).origin;
  const sitemap = await fetchText(`${base}/sitemap.xml`, fetchImpl);
  if (sitemap.status !== 200) {
    throw new Error(`sitemap.xml returned HTTP ${sitemap.status}`);
  }
  const robots = await fetchText(`${base}/robots.txt`, fetchImpl);
  const disallow = parseRobotsDisallow(robots.body);
  const locs = parseSitemapLocs(sitemap.body);
  const sitemapPaths = new Set(
    locs.map(loc => new URL(loc).pathname.replace(/\/+$/, '') || '/')
  );
  const urls = locs
    .map(loc => new URL(new URL(loc).pathname, base).toString())
    .slice(0, maxPages);

  const pages = (
    await mapWithConcurrency(urls, CONCURRENCY, async url => {
      const pathname = new URL(url).pathname.replace(/\/+$/, '') || '/';
      const snapshot = await fetchText(url, fetchImpl).catch(
        (error: unknown): FetchedText => {
          console.warn(`fetch failed ${url}: ${String(error)}`);
          return { status: 0, body: '', contentType: '', xRobotsTag: null };
        }
      );
      // Machine surfaces (llms.txt, openapi.json) are listed for agents, not certified as pages.
      if (snapshot.status === 200 && !snapshot.contentType.includes('html'))
        return null;
      return certifyPage(
        {
          url,
          status: snapshot.status,
          html: snapshot.body,
          xRobotsTag: snapshot.xRobotsTag,
        },
        {
          siteOrigin: base,
          inSitemap: sitemapPaths.has(pathname),
          robotsDisallowed: disallow.some(prefix =>
            pathname.startsWith(prefix)
          ),
        }
      );
    })
  ).filter((page): page is SeoPageCertification => page !== null);

  const llms = await fetchText(`${base}/llms.txt`, fetchImpl).catch(() => null);
  const siteChecks: SeoCheck[] = [
    ...auditIsAgentic(
      parseIsAgenticReport(isAgenticRaw),
      IS_AGENTIC_SCORE_FLOOR
    ),
    llms?.status === 200 && llms.body.trim().length > 0
      ? {
          id: 'llms-txt',
          dimension: 'agentic',
          status: 'passed',
          summary: 'llms.txt served',
        }
      : {
          id: 'llms-txt',
          dimension: 'agentic',
          status: 'failed',
          summary: `llms.txt HTTP ${llms?.status ?? 'unreachable'}`,
          remediation: 'Restore apps/web/app/llms.txt/route.ts.',
        },
  ];

  return {
    contract: SEO_CERTIFICATION_CONTRACT,
    generatedAt: new Date().toISOString(),
    base,
    sourceSha,
    site: { checks: siteChecks },
    summary: summarize(pages),
    pages: pages.map(page => ({
      ...page,
      receipts: toCertificationReceipts(page, sourceSha, ref),
    })),
  };
}

/** Regressions against the ratchet plus any failed site-level check. */
export function sweepRegressions(
  report: SeoCertificationReport,
  maxFailingPages: Readonly<Record<string, number>>
): string[] {
  return [
    ...ratchetRegressions(report.summary.failuresByCheck, maxFailingPages),
    ...report.site.checks
      .filter(item => item.status === 'failed')
      .map(item => `site ${item.id}: ${item.summary}`),
  ];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'https://jov.ie' },
      'is-agentic-report': { type: 'string' },
      'max-pages': { type: 'string', default: '400' },
      out: { type: 'string', default: 'seo-certification.json' },
      ratchet: { type: 'boolean', default: false },
    },
  });
  let isAgenticRaw: unknown = null;
  if (values['is-agentic-report']) {
    try {
      isAgenticRaw = JSON.parse(
        readFileSync(values['is-agentic-report'], 'utf8')
      );
    } catch (error) {
      console.warn(`is-agentic report unreadable: ${String(error)}`);
    }
  }
  const report = await runSweep({
    base: values.base ?? 'https://jov.ie',
    maxPages: Number.parseInt(values['max-pages'] ?? '400', 10),
    isAgenticRaw,
    sourceSha: process.env.GITHUB_SHA ?? null,
    ref: process.env.GITHUB_RUN_ID
      ? `github-actions:${process.env.GITHUB_RUN_ID}`
      : 'local',
  });
  writeFileSync(
    values.out ?? 'seo-certification.json',
    `${JSON.stringify(report, null, 2)}\n`
  );
  const markdown = renderMarkdown(report);
  process.stdout.write(markdown);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);

  if (values.ratchet) {
    const { maxFailingPages } = JSON.parse(
      readFileSync(RATCHET_PATH, 'utf8')
    ) as { maxFailingPages: Record<string, number> };
    const regressions = sweepRegressions(report, maxFailingPages);
    if (regressions.length > 0) {
      console.error(
        `SEO certification regressions:\n- ${regressions.join('\n- ')}`
      );
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
