/**
 * Pure selection for a no-spend public-link lead list.
 *
 * The research script fetches pages and passes them here. This module does
 * not fetch, does not insert leads, and does not approve or send outreach.
 */

import type { ObservedPublicLinkPage } from '@/lib/leads/public-link-observation';
import { qualifyObservedPublicLink } from '@/lib/leads/public-link-observation';
import {
  parseLayloProfile,
  parseLinktreeAccount,
  parseSmartLinkHtml,
} from '@/lib/leads/public-link-page-parsers';

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

export interface PublicLinkListLead {
  readonly page: ObservedPublicLinkPage;
  readonly fitScore: number;
  readonly musicToolsDetected: readonly string[];
  readonly hasRepresentation: boolean;
  readonly representationSignal: string | null;
  readonly hasOutboundDsp: boolean;
}

export type PublicLinkDropCounts = Record<string, number>;

export type PublicPageRead = (
  url: string,
  budget: { left: number }
) => Promise<string | null>;

export interface PublicLinkListPayload {
  readonly issue: 'JOV-12541';
  readonly generatedAt: string;
  readonly note: string;
  readonly counts: {
    readonly requests: number;
    readonly considered: number;
    readonly qualified: number;
    readonly dropped: PublicLinkDropCounts;
    readonly byPlatform: Record<string, number>;
  };
  readonly qualified: ReadonlyArray<{
    readonly url: string;
    readonly platform: ObservedPublicLinkPage['platform'];
    readonly handle: string;
    readonly displayName: string | null;
    readonly fitScore: number;
    readonly musicToolsDetected: readonly string[];
    readonly hasRepresentation: boolean;
    readonly representationSignal: string | null;
  }>;
  readonly intake: {
    readonly urls: readonly string[];
    readonly pages: ReadonlyArray<{
      readonly url: string;
      readonly displayName: string | null;
      readonly bio: string | null;
      readonly text: string | null;
      readonly links: ReadonlyArray<{ readonly url: string }>;
      readonly hasTrackingPixels: boolean;
    }>;
  };
}

export function argumentValue(
  argv: readonly string[],
  name: string
): string | null {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : null;
  return value && !value.startsWith('--') ? value : null;
}

export function numberArgumentValue(
  argv: readonly string[],
  name: string,
  fallback: number
): number {
  const raw = argumentValue(argv, name);
  const parsed = raw ? Number(raw) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function sampleItems<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from(
    { length: count },
    (_, index) => items[Math.floor(index * step)]
  ).filter((item): item is T => item !== undefined);
}

function bumpDrop(dropped: PublicLinkDropCounts, reason: string): void {
  dropped[reason] = (dropped[reason] ?? 0) + 1;
}

export function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function stringAt(
  value: unknown,
  parent: string,
  key: string
): string | null {
  const child = record(record(value)?.[parent]);
  const field = child?.[key];
  return typeof field === 'string' && field.trim() ? field : null;
}

export function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    match => match[1]?.trim() ?? ''
  );
}

export function layloProfiles(urls: readonly string[]): string[] {
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

export function smartLinkLocs(urls: readonly string[], host: string): string[] {
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

export function linktreeHandles(html: string): string[] {
  return [
    ...html.matchAll(/https:\/\/linktr\.ee\/([A-Za-z0-9._-]{2,})(?:\?|")/g),
  ].flatMap(match => {
    const handle = (match[1] ?? '').toLowerCase();
    return handle && !RESERVED.has(handle) ? [handle] : [];
  });
}

export function linktreeAccount(html: string): unknown | null {
  const start = html.indexOf('<script id="__NEXT_DATA__"');
  const open = start < 0 ? -1 : html.indexOf('>', start);
  const close = open < 0 ? -1 : html.indexOf('</script>', open);
  if (open < 0 || close < 0) return null;
  const json = parseJsonValue(html.slice(open + 1, close));
  const props = record(json)?.props;
  const pageProps = record(props)?.pageProps;
  return record(pageProps)?.account ?? null;
}

export function considerPublicLink(
  page: ObservedPublicLinkPage | null,
  built: PublicLinkListLead[],
  seen: Set<string>,
  dropped: PublicLinkDropCounts
): void {
  if (!page || seen.has(page.url)) {
    if (!page) bumpDrop(dropped, 'unparsed');
    return;
  }
  seen.add(page.url);
  const decision = qualifyObservedPublicLink(page);
  if (decision.outcome !== 'qualified') {
    bumpDrop(dropped, decision.disqualificationReason ?? 'disqualified');
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

export function selectPublicLinkLeads(
  leads: readonly PublicLinkListLead[],
  max: number
): PublicLinkListLead[] {
  const withDsp = leads.filter(lead => lead.hasOutboundDsp);
  const pool = [...(withDsp.length >= 50 ? withDsp : leads)].sort(
    (a, b) => b.fitScore - a.fitScore
  );
  const buckets = new Map<string, PublicLinkListLead[]>();
  for (const lead of pool) {
    const bucket = buckets.get(lead.page.platform) ?? [];
    bucket.push(lead);
    buckets.set(lead.page.platform, bucket);
  }
  const selected: PublicLinkListLead[] = [];
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

export function harvestedFollowUps(leads: readonly PublicLinkListLead[]): {
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

function countPlatforms(
  leads: readonly PublicLinkListLead[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const lead of leads) {
    counts[lead.page.platform] = (counts[lead.page.platform] ?? 0) + 1;
  }
  return counts;
}

export function buildPublicLinkListPayload(input: {
  readonly generatedAt: string;
  readonly maxRequests: number;
  readonly budgetLeft: number;
  readonly built: readonly PublicLinkListLead[];
  readonly selected: readonly PublicLinkListLead[];
  readonly dropped: PublicLinkDropCounts;
}): PublicLinkListPayload {
  return {
    issue: 'JOV-12541',
    generatedAt: input.generatedAt,
    note: 'Prepared intake. Not loaded. Nothing approved or sent.',
    counts: {
      requests: input.maxRequests - input.budgetLeft,
      considered: input.built.length,
      qualified: input.selected.length,
      dropped: input.dropped,
      byPlatform: countPlatforms(input.selected),
    },
    qualified: input.selected.map(lead => ({
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
      urls: input.selected.map(lead => lead.page.url),
      pages: input.selected.map(lead => ({
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
}

export function renderPublicLinkList(payload: PublicLinkListPayload): string {
  return JSON.stringify(payload, null, 2).replace(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    ''
  );
}

export async function collectLayloProfiles(
  urls: readonly string[],
  budget: { left: number },
  built: PublicLinkListLead[],
  seen: Set<string>,
  dropped: PublicLinkDropCounts,
  read: PublicPageRead,
  observedAt: string
): Promise<void> {
  await mapPool(urls, 4, async url => {
    const handle = url.split('/').filter(Boolean).at(-1);
    if (!handle) return;
    const profileRaw = await read(
      `https://d21i0hc4hl3bvt.cloudfront.net/${handle}/profile.json`,
      budget
    );
    if (!profileRaw) return bumpDrop(dropped, 'fetch_failed');
    const profile = parseJsonValue(profileRaw);
    const userId = stringAt(profile, 'user', 'id');
    const userRaw = userId
      ? await read(
          `https://d3oyaxbt9vo0fg.cloudfront.net/users/${userId}.json`,
          budget
        )
      : null;
    considerPublicLink(
      parseLayloProfile(
        profile,
        userRaw ? parseJsonValue(userRaw) : null,
        url,
        observedAt
      ),
      built,
      seen,
      dropped
    );
  });
}

export async function collectSmartLinkPages(
  urls: readonly string[],
  budget: { left: number },
  built: PublicLinkListLead[],
  seen: Set<string>,
  dropped: PublicLinkDropCounts,
  read: PublicPageRead,
  observedAt: string
): Promise<void> {
  await mapPool(urls, 4, async url => {
    const html = await read(url, budget);
    if (!html) return bumpDrop(dropped, 'fetch_failed');
    considerPublicLink(
      parseSmartLinkHtml(html, url, observedAt),
      built,
      seen,
      dropped
    );
  });
}

export async function collectLinktreeHandles(
  handles: readonly string[],
  budget: { left: number },
  built: PublicLinkListLead[],
  seen: Set<string>,
  dropped: PublicLinkDropCounts,
  read: PublicPageRead,
  observedAt: string
): Promise<void> {
  await mapPool(handles, 4, async handle => {
    const html = await read(`https://linktr.ee/${handle}`, budget);
    if (!html) return bumpDrop(dropped, 'fetch_failed');
    const account = linktreeAccount(html);
    if (!account) return bumpDrop(dropped, 'unparsed');
    considerPublicLink(
      parseLinktreeAccount(account, `https://linktr.ee/${handle}`, observedAt),
      built,
      seen,
      dropped
    );
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null;
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
