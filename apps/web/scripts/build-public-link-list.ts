/**
 * Builds a no-spend qualified artist list from public Linkfire, Feature.fm,
 * Laylo and Linktree pages. Writes a JSON intake payload and does not insert
 * leads, approve them, or send anything.
 *
 * Laylo JSON hosts match fetchLayloProfile in lib/ingestion/strategies/laylo.ts.
 *
 * pnpm --filter @jovie/web leads:public-link-list -- --out /tmp/leads.json
 */

import { writeFile } from 'node:fs/promises';
import {
  argumentValue,
  buildPublicLinkListPayload,
  collectLayloProfiles,
  collectLinktreeHandles,
  collectSmartLinkPages,
  harvestedFollowUps,
  layloProfiles,
  linktreeHandles,
  locs,
  numberArgumentValue,
  type PublicLinkDropCounts,
  type PublicLinkListLead,
  renderPublicLinkList,
  sampleItems,
  selectPublicLinkLeads,
  smartLinkLocs,
} from '@/lib/leads/public-link-list';

const USER_AGENT =
  'JoviePublicLinkResearch/1.0 (+https://jov.ie; public page read, no outreach)';
const OBSERVED_AT = new Date().toISOString();

async function main(): Promise<void> {
  const out = argumentValue(process.argv, '--out');
  if (!out) {
    process.stderr.write('missing --out\n');
    process.exitCode = 1;
    return;
  }
  const target = numberArgumentValue(process.argv, '--target', 120);
  const maxRequests = numberArgumentValue(process.argv, '--max-requests', 450);
  const budget = { left: maxRequests };
  const dropped: PublicLinkDropCounts = {};
  const built: PublicLinkListLead[] = [];
  const seen = new Set<string>();

  const layloSitemap = await text('https://laylo.com/sitemap-6.xml', budget);
  await collectLayloProfiles(
    sampleItems(layloProfiles(locs(layloSitemap ?? '')), 90),
    budget,
    built,
    seen,
    dropped,
    text,
    OBSERVED_AT
  );

  const ffmSitemap = await text('https://ffm.to/sitemap.xml', budget);
  await collectSmartLinkPages(
    sampleItems(smartLinkLocs(locs(ffmSitemap ?? ''), 'ffm.to'), 90),
    budget,
    built,
    seen,
    dropped,
    text,
    OBSERVED_AT
  );

  const directory = await text(
    'https://linktr.ee/discover/profile-directory/sitemap.xml',
    budget
  );
  const directoryPages = sampleItems(
    locs(directory ?? '').filter(url =>
      /\/(creative|entertainment)\/page-([1-9][0-9]|[6-9])(?:\/|$)/.test(url)
    ),
    6
  );
  const handles = new Set<string>();
  for (const directoryUrl of directoryPages) {
    const html = await text(directoryUrl, budget);
    for (const handle of linktreeHandles(html ?? '')) handles.add(handle);
    if (handles.size >= 80) break;
  }
  await collectLinktreeHandles(
    [...handles].slice(0, 80),
    budget,
    built,
    seen,
    dropped,
    text,
    OBSERVED_AT
  );

  const harvested = harvestedFollowUps(built);
  await collectSmartLinkPages(
    [...harvested.smartLinks].slice(0, 40),
    budget,
    built,
    seen,
    dropped,
    text,
    OBSERVED_AT
  );
  await collectLinktreeHandles(
    [...harvested.linktree].slice(0, 40),
    budget,
    built,
    seen,
    dropped,
    text,
    OBSERVED_AT
  );

  const selected = selectPublicLinkLeads(built, Math.min(target, 200));
  const payload = buildPublicLinkListPayload({
    generatedAt: OBSERVED_AT,
    maxRequests,
    budgetLeft: budget.left,
    built,
    selected,
    dropped,
  });
  await writeFile(out, renderPublicLinkList(payload));
  process.stdout.write(
    `${JSON.stringify({
      qualified: selected.length,
      byPlatform: payload.counts.byPlatform,
      requests: payload.counts.requests,
    })}\n`
  );
}

async function text(
  url: string,
  budget: { left: number }
): Promise<string | null> {
  if (budget.left <= 0) return null;
  budget.left -= 1;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    await sleep(120);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(error => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'failed'}\n`
  );
  process.exitCode = 1;
});
