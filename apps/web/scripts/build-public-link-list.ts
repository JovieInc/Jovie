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
import type { ObservedPublicLinkPage } from '@/lib/leads/public-link-observation';
import { qualifyObservedPublicLink } from '@/lib/leads/public-link-observation';
import {
  parseLayloProfile,
  parseLinktreeAccount,
  parseSmartLinkHtml,
} from '@/lib/leads/public-link-page-parsers';

const USER_AGENT =
  'JoviePublicLinkResearch/1.0 (+https://jov.ie; public page read, no outreach)';
const OBSERVED_AT = new Date().toISOString();
const DSP_ROOTS = [
  'spotify.com',
  'spoti.fi',
  'music.apple.com',
  'soundcloud.com',
  'bandcamp.com',
  'beatport.com',
  'tidal.com',
  'deezer.com',
  'audiomack.com',
  'music.amazon.com',
  'youtube.com',
  'youtu.be',
];
const RESERVED = new Set([
  'about',
  'account',
  'blog',
  'compare',
  'discover',
  'features',
  'how-to',
  'letters',
  'login',
  'privacy',
  'sitemap',
  'terms',
  'tools',
]);

interface BuiltLead {
  readonly page: ObservedPublicLinkPage;
  readonly fitScore: number;
  readonly musicToolsDetected: string[];
  readonly hasRepresentation: boolean;
  readonly representationSignal: string | null;
  readonly hasOutboundDsp: boolean;
}

interface Dropped {
  readonly [reason: string]: number;
}

async function main(): Promise<void> {
  const out = argument('--out');
  if (!out) {
    process.stderr.write('missing --out\n');
    process.exitCode = 1;
    return;
  }
  const target = numberArgument('--target', 120);
  const maxRequests = numberArgument('--max-requests', 450);
  const budget = { left: maxRequests };
  const dropped: Dropped = {};
  const built: BuiltLead[] = [];
  const seen = new Set<string>();

  const layloSitemap = await text('https://laylo.com/sitemap-6.xml', budget);
  await collectLaylo(
    sample(layloProfiles(locs(layloSitemap ?? '')), 90),
    budget,
    built,
    seen,
    dropped
  );

  const ffmSitemap = await text('https://ffm.to/sitemap.xml', budget);
  await collectSmartLinks(
    sample(smartLinkLocs(locs(ffmSitemap ?? ''), 'ffm.to'), 90),
    budget,
    built,
    seen,
    dropped
  );

  const directory = await text(
    'https://linktr.ee/discover/profile-directory/sitemap.xml',
    budget
  );
  const directoryPages = sample(
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
  await collectLinktree(
    [...handles].slice(0, 80),
    budget,
    built,
    seen,
    dropped
  );

  const harvested = harvestedFollowUps(built);
  await collectSmartLinks(
    [...harvested.smartLinks].slice(0, 40),
    budget,
    built,
    seen,
    dropped
  );
  await collectLinktree(
    [...harvested.linktree].slice(0, 40),
    budget,
    built,
    seen,
    dropped
  );

  const selected = selectLeads(built, Math.min(target, 200));
  const byPlatform = countPlatforms(selected);
  const payload = {
    issue: 'JOV-12541',
    generatedAt: OBSERVED_AT,
    note: 'Prepared intake. Not loaded. Nothing approved or sent.',
    counts: {
      requests: maxRequests - budget.left,
      considered: built.length,
      qualified: selected.length,
      dropped,
      byPlatform,
    },
    qualified: selected.map(lead => ({
      url: lead.page.url,
      platform: lead.page.platform,
      handle: lead.page.handle,
      displayName: lead.page.displayName,
      fitScore: lead.fitScore,
      musicToolsDetected: lead.musicToolsDetected,
      hasRepresentation: lead.hasRepresentation,
      representationSignal: lead.representationSignal,
    })),
    intake: {
      urls: selected.map(lead => lead.page.url),
      pages: selected.map(lead => ({
        url: lead.page.url,
        displayName: lead.page.displayName,
        bio: lead.page.bio,
        text: lead.page.text,
        links: lead.page.links
          .filter(link => link.url !== lead.page.url)
          .map(link => ({ url: link.url })),
        hasTrackingPixels: lead.page.hasTrackingPixels,
      })),
    },
  };
  const body = JSON.stringify(payload, null, 2).replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    '[redacted]'
  );
  await writeFile(out, body);
  process.stdout.write(
    `${JSON.stringify({ qualified: selected.length, byPlatform, requests: payload.counts.requests })}\n`
  );
}

async function collectLaylo(
  urls: readonly string[],
  budget: { left: number },
  built: BuiltLead[],
  seen: Set<string>,
  dropped: Dropped
): Promise<void> {
  await mapPool(urls, 4, async url => {
    const handle = url.split('/').filter(Boolean).at(-1);
    if (!handle) return;
    const profileRaw = await text(
      `https://d21i0hc4hl3bvt.cloudfront.net/${handle}/profile.json`,
      budget
    );
    if (!profileRaw) return bump(dropped, 'fetch_failed');
    const profile = parseJson(profileRaw);
    const userId = stringAt(profile, 'user', 'id');
    const userRaw = userId
      ? await text(
          `https://d3oyaxbt9vo0fg.cloudfront.net/users/${userId}.json`,
          budget
        )
      : null;
    const page = parseLayloProfile(
      profile,
      userRaw ? parseJson(userRaw) : null,
      url,
      OBSERVED_AT
    );
    consider(page, built, seen, dropped);
  });
}

async function collectSmartLinks(
  urls: readonly string[],
  budget: { left: number },
  built: BuiltLead[],
  seen: Set<string>,
  dropped: Dropped
): Promise<void> {
  await mapPool(urls, 4, async url => {
    const html = await text(url, budget);
    if (!html) return bump(dropped, 'fetch_failed');
    consider(parseSmartLinkHtml(html, url, OBSERVED_AT), built, seen, dropped);
  });
}

async function collectLinktree(
  handles: readonly string[],
  budget: { left: number },
  built: BuiltLead[],
  seen: Set<string>,
  dropped: Dropped
): Promise<void> {
  await mapPool(handles, 4, async handle => {
    const html = await text(`https://linktr.ee/${handle}`, budget);
    if (!html) return bump(dropped, 'fetch_failed');
    const account = linktreeAccount(html);
    if (!account) return bump(dropped, 'unparsed');
    consider(
      parseLinktreeAccount(account, `https://linktr.ee/${handle}`, OBSERVED_AT),
      built,
      seen,
      dropped
    );
  });
}

function consider(
  page: ObservedPublicLinkPage | null,
  built: BuiltLead[],
  seen: Set<string>,
  dropped: Dropped
): void {
  if (!page || seen.has(page.url)) {
    if (!page) bump(dropped, 'unparsed');
    return;
  }
  seen.add(page.url);
  const decision = qualifyObservedPublicLink(page);
  if (decision.outcome !== 'qualified') {
    bump(dropped, decision.disqualificationReason ?? 'disqualified');
    return;
  }
  built.push({
    page,
    fitScore: decision.fitScore,
    musicToolsDetected: decision.musicToolsDetected,
    hasRepresentation: decision.hasRepresentation,
    representationSignal: decision.representationSignal,
    hasOutboundDsp: page.links.some(link => isDsp(link.url, page.url)),
  });
}

function selectLeads(leads: readonly BuiltLead[], max: number): BuiltLead[] {
  const withDsp = leads.filter(lead => lead.hasOutboundDsp);
  const pool = [...(withDsp.length >= 50 ? withDsp : leads)].sort(
    (a, b) => b.fitScore - a.fitScore
  );
  const buckets = new Map<string, BuiltLead[]>();
  for (const lead of pool) {
    const bucket = buckets.get(lead.page.platform) ?? [];
    bucket.push(lead);
    buckets.set(lead.page.platform, bucket);
  }
  const selected: BuiltLead[] = [];
  const platforms = [...buckets.keys()].sort();
  while (
    selected.length < max &&
    platforms.some(platform => (buckets.get(platform) ?? []).length > 0)
  ) {
    for (const platform of platforms) {
      const next = buckets.get(platform)?.shift();
      if (!next || selected.length >= max) continue;
      selected.push(next);
    }
  }
  return selected;
}

function harvestedFollowUps(leads: readonly BuiltLead[]): {
  smartLinks: Set<string>;
  linktree: Set<string>;
} {
  const smartLinks = new Set<string>();
  const linktree = new Set<string>();
  for (const lead of leads) {
    for (const link of lead.page.links) {
      const bare = link.url.split('?')[0] ?? link.url;
      if (/^https:\/\/([^/]+\.)?(lnk\.to|linkfire\.com)\//i.test(bare)) {
        smartLinks.add(bare);
      }
      const handle = bare.match(
        /^https:\/\/linktr\.ee\/([a-z0-9._-]{2,})$/i
      )?.[1];
      if (handle && !RESERVED.has(handle.toLowerCase())) {
        linktree.add(handle.toLowerCase());
      }
    }
  }
  return { smartLinks, linktree };
}

function layloProfiles(urls: readonly string[]): string[] {
  return urls.filter(url => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.replace(/^www\./, '') !== 'laylo.com') return false;
      const parts = parsed.pathname.split('/').filter(Boolean);
      return parts.length === 1 && !RESERVED.has(parts[0]?.toLowerCase() ?? '');
    } catch {
      return false;
    }
  });
}

function smartLinkLocs(urls: readonly string[], host: string): string[] {
  return urls.filter(url => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.replace(/^www\./, '') !== host) return false;
      const slug = parsed.pathname.split('/').filter(Boolean).at(-1) ?? '';
      return (
        slug.length > 2 && !/giveaway|contest|sweep|win-a|winner/i.test(slug)
      );
    } catch {
      return false;
    }
  });
}

function linktreeHandles(html: string): string[] {
  return [
    ...html.matchAll(/https:\/\/linktr\.ee\/([A-Za-z0-9._-]{2,})(?:\?|")/g),
  ].flatMap(match => {
    const handle = (match[1] ?? '').toLowerCase();
    return handle && !RESERVED.has(handle) ? [handle] : [];
  });
}

function linktreeAccount(html: string): unknown | null {
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  const open = start < 0 ? -1 : html.indexOf('>', start);
  const close = open < 0 ? -1 : html.indexOf('</script>', open);
  if (open < 0 || close < 0) return null;
  const json = parseJson(html.slice(open + 1, close));
  const props = record(json)?.props;
  const pageProps = record(props)?.pageProps;
  return record(pageProps)?.account ?? null;
}

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    match => match[1]?.trim() ?? ''
  );
}

function isDsp(url: string, pageUrl: string): boolean {
  if (url === pageUrl) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return DSP_ROOTS.some(root => host === root || host.endsWith(`.${root}`));
  } catch {
    return false;
  }
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

async function mapPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  async function run(): Promise<void> {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current !== undefined) await worker(current);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  );
}

function sample<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor(index * step)]
  ).filter((item): item is T => item !== undefined);
}

function countPlatforms(leads: readonly BuiltLead[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lead of leads) {
    counts[lead.page.platform] = (counts[lead.page.platform] ?? 0) + 1;
  }
  return counts;
}

function bump(dropped: Dropped, reason: string): void {
  dropped[reason] = (dropped[reason] ?? 0) + 1;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
}

function stringAt(value: unknown, parent: string, key: string): string | null {
  const child = record(record(value)?.[parent]);
  const field = child?.[key];
  return typeof field === 'string' && field.trim() ? field : null;
}

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : null;
  return value && !value.startsWith('--') ? value : null;
}

function numberArgument(name: string, fallback: number): number {
  const raw = argument(name);
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
