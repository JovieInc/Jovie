/**
 * Qualifies a public link page the caller already fetched.
 *
 * Linkfire, Feature.fm, Laylo and Linktree pages are scored with the buyer
 * pre-screen. This module does not fetch, does not call a paid search API,
 * and does not approve or send outreach. Feature.fm and Linkfire stay in the
 * snapshot: the source_platform enum cannot name them.
 */

import type { LeadSignalSnapshot } from '@/lib/db/schema/leads';
import { prescreenBuyer, prescreenFailReason } from './buyer-signals';
import {
  existingRelationshipHold,
  existingRelationshipNotes,
} from './existing-relationships';

export type PublicLinkPlatform =
  | 'linktree'
  | 'featurefm'
  | 'linkfire'
  | 'laylo';

export interface ObservedPublicLinkPage {
  readonly platform: PublicLinkPlatform;
  readonly url: string;
  readonly handle: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly text: string | null;
  readonly links: ReadonlyArray<{ readonly url: string }>;
  readonly hasTrackingPixels: boolean;
  readonly observedAt: string;
  readonly source: 'direct_public_page';
}

export interface PublicLinkQualification {
  readonly outcome: 'qualified' | 'disqualified';
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly fitScore: number;
  readonly fitScoreBreakdown: Record<string, unknown>;
  readonly musicToolsDetected: string[];
  readonly disqualificationReason: string | null;
  readonly hasRepresentation: boolean;
  readonly representationSignal: string | null;
  readonly hasSpotifyLink: boolean;
  readonly spotifyUrl: string | null;
  readonly hasInstagram: boolean;
  readonly instagramHandle: string | null;
  readonly allLinks: Array<{ url: string }>;
  readonly hasTrackingPixels: boolean;
  readonly sourcePlatform: 'linktree' | 'laylo' | null;
  readonly sourceUrl: string;
  readonly sourceHandle: string;
}

const PLATFORM_HOSTS: Record<PublicLinkPlatform, readonly string[]> = {
  featurefm: ['ffm.to', 'ffm.bio', 'feature.fm'],
  laylo: ['laylo.com'],
  linkfire: ['lnk.to', 'linkfire.com'],
  linktree: ['linktr.ee', 'linktree.com'],
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_TEST = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const CONTEST_PATTERN =
  /\b(giveaway|contest|enter to win|sweepstakes|win a copy)\b/i;
const MAX_LINKS = 40;
const MAX_TEXT = 500;
/** Founder handle. Keep in step with TIM_WHITE_PROFILE.handle. */
const EXCLUDED_HANDLES = ['timwhite'] as const;
const RESERVED_LINK_HANDLES = new Set([
  'discover',
  'tools',
  'login',
  'signup',
  'about',
  'privacy',
  'terms',
  'letters',
]);
const INSTAGRAM_RESERVED = new Set([
  'about',
  'accounts',
  'explore',
  'p',
  'reel',
  'reels',
  'stories',
]);

interface LooseRecord {
  readonly [key: string]: unknown;
}

export function publicLinkPlatform(url: string): PublicLinkPlatform | null {
  const host = hostname(url);
  if (!host) return null;
  const platforms = Object.keys(PLATFORM_HOSTS) as PublicLinkPlatform[];
  return (
    platforms.find(platform =>
      PLATFORM_HOSTS[platform].some(
        root => host === root || host.endsWith(`.${root}`)
      )
    ) ?? null
  );
}

/** Lowercase host, no query, hash, or trailing slash. */
export function canonicalPublicLinkUrl(url: string): string | null {
  const platform = publicLinkPlatform(url);
  if (!platform) return null;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `https://${host}${path}`;
  } catch {
    return null;
  }
}

export function observePublicLinkPage(input: {
  readonly url: string;
  readonly displayName?: string | null;
  readonly bio?: string | null;
  readonly text?: string | null;
  readonly links?: ReadonlyArray<{ readonly url: string } | string>;
  readonly hasTrackingPixels?: boolean;
  readonly observedAt: string;
  readonly handle?: string | null;
}): ObservedPublicLinkPage | null {
  const platform = publicLinkPlatform(input.url);
  const url = canonicalPublicLinkUrl(input.url);
  if (!platform || !url) return null;
  const handle = sanitizeHandle(input.handle) ?? handleFromUrl(url, platform);
  if (!handle || RESERVED_LINK_HANDLES.has(handle)) return null;
  const links = uniqueLinks(
    [
      url,
      ...(input.links ?? []).map(link =>
        typeof link === 'string' ? link : link.url
      ),
    ],
    url
  );
  return {
    platform,
    url,
    handle,
    displayName: clip(stripEmails(input.displayName), 200),
    bio: clip(stripEmails(input.bio), MAX_TEXT),
    text: clip(stripEmails(input.text), MAX_TEXT),
    links,
    hasTrackingPixels: input.hasTrackingPixels === true,
    observedAt: input.observedAt,
    source: 'direct_public_page',
  };
}

export function matchObservedPage(
  url: string,
  pages: readonly ObservedPublicLinkPage[]
): ObservedPublicLinkPage | null {
  const canonical = canonicalPublicLinkUrl(url);
  if (!canonical) return null;
  return pages.find(page => page.url === canonical) ?? null;
}

export function qualifyObservedPublicLink(
  page: ObservedPublicLinkPage,
  options?: { readonly alternateHandle?: string | null }
): PublicLinkQualification {
  const prescreen = prescreenBuyer(
    {
      handle: page.handle,
      displayName: page.displayName,
      bio: page.bio,
      text: page.text,
      links: page.links,
      hasTrackingPixels: page.hasTrackingPixels,
    },
    { pageSeenInFull: true, excludedHandles: EXCLUDED_HANDLES }
  );
  const relationship = relationshipFor(page, options?.alternateHandle);
  const contest =
    prescreen.decision === 'pass' && CONTEST_PATTERN.test(visibleText(page));
  const passed = prescreen.decision === 'pass' && !contest;
  const spotifyUrl = firstHostLink(page.links, ['spotify.com', 'spoti.fi']);
  const instagramHandle = instagramHandleFromLinks(page.links);
  return {
    outcome: passed ? 'qualified' : 'disqualified',
    displayName: page.displayName,
    bio: page.bio,
    fitScore: prescreen.score,
    fitScoreBreakdown: {
      scorer: 'buyer_prescreen',
      source: 'public_page',
      platform: page.platform,
      url: page.url,
      score: prescreen.score,
      reasons: contest
        ? [...prescreen.reasons, 'contest or giveaway page']
        : prescreen.reasons,
      signals: prescreen.signals,
      relationshipHold: relationship.holdReason,
      relationshipNotes: relationship.notes,
    },
    musicToolsDetected: [...prescreen.replacedTools].sort((a, b) =>
      a.localeCompare(b)
    ),
    disqualificationReason: passed
      ? null
      : contest
        ? 'contest_or_giveaway'
        : prescreenFailReason(prescreen),
    hasRepresentation: relationship.holdReason !== null,
    representationSignal:
      relationship.holdReason ?? relationship.notes[0] ?? null,
    hasSpotifyLink: spotifyUrl !== null,
    spotifyUrl,
    hasInstagram: instagramHandle !== null,
    instagramHandle,
    allLinks: page.links.map(link => ({ url: link.url })),
    hasTrackingPixels: page.hasTrackingPixels,
    sourcePlatform:
      page.platform === 'laylo' || page.platform === 'linktree'
        ? page.platform
        : null,
    sourceUrl: page.url,
    sourceHandle: page.handle,
  };
}

export function publicPageSignalSnapshot(
  page: ObservedPublicLinkPage
): LeadSignalSnapshot {
  const spotifyUrl = firstHostLink(page.links, ['spotify.com', 'spoti.fi']);
  return {
    verified: null,
    hasPaidTier: null,
    hasSpotifyLink: spotifyUrl !== null,
    hasInstagram: instagramHandleFromLinks(page.links) !== null,
    musicToolsDetected: [],
    allLinks: page.links.map(link => ({ url: link.url })),
    hasTrackingPixels: page.hasTrackingPixels,
    trackingPixelPlatforms: [],
    discoveryQuery: null,
    sourcePlatform: page.platform === 'laylo' ? 'laylo' : 'linktree',
    publicPage: {
      platform: page.platform,
      url: page.url,
      handle: page.handle,
      displayName: page.displayName,
      bio: page.bio,
      text: page.text,
      links: page.links.map(link => ({ url: link.url })),
      hasTrackingPixels: page.hasTrackingPixels,
      observedAt: page.observedAt,
      source: 'direct_public_page',
    },
  };
}

export function mergePublicPageSnapshot(
  existing: LeadSignalSnapshot | null | undefined,
  page: ObservedPublicLinkPage
): LeadSignalSnapshot {
  const next = publicPageSignalSnapshot(page);
  const merged: LeadSignalSnapshot = {
    ...existing,
    ...next,
    discoveryQuery: existing?.discoveryQuery ?? null,
    verified: existing?.verified ?? null,
  };
  if (existing?.searchEvidence) merged.searchEvidence = existing.searchEvidence;
  return merged;
}

export function readObservedPublicPage(
  snapshot: { readonly publicPage?: unknown } | null | undefined
): ObservedPublicLinkPage | null {
  const page = snapshot?.publicPage;
  if (!page || typeof page !== 'object') return null;
  const record = page as LooseRecord;
  if (record.source !== 'direct_public_page') return null;
  if (typeof record.url !== 'string' || typeof record.observedAt !== 'string')
    return null;
  const links = Array.isArray(record.links)
    ? record.links.flatMap(link => {
        if (!link || typeof link !== 'object') return [];
        const url = (link as LooseRecord).url;
        return typeof url === 'string' ? [{ url }] : [];
      })
    : [];
  return observePublicLinkPage({
    url: record.url,
    displayName:
      typeof record.displayName === 'string' ? record.displayName : null,
    bio: typeof record.bio === 'string' ? record.bio : null,
    text: typeof record.text === 'string' ? record.text : null,
    links,
    hasTrackingPixels: record.hasTrackingPixels === true,
    observedAt: record.observedAt,
    handle: typeof record.handle === 'string' ? record.handle : null,
  });
}

function relationshipFor(
  page: ObservedPublicLinkPage,
  alternateHandle: string | null | undefined
): { holdReason: string | null; notes: string[] } {
  const bio = [page.bio, page.text].filter(Boolean).join('\n') || null;
  const instagramHandle = instagramHandleFromLinks(page.links);
  const handles = [page.handle, alternateHandle]
    .map(value => value?.trim())
    .filter((value): value is string => Boolean(value));
  let holdReason: string | null = null;
  for (const handle of handles) {
    const hold = existingRelationshipHold({
      handle,
      displayName: page.displayName,
      bio,
      instagramHandle,
    });
    if (hold) {
      holdReason = hold.reason;
      break;
    }
  }
  const notes = existingRelationshipNotes({
    handle: page.handle,
    displayName: page.displayName,
    bio,
    instagramHandle,
  });
  return { holdReason, notes };
}

function visibleText(page: ObservedPublicLinkPage): string {
  return [page.displayName, page.bio, page.text].filter(Boolean).join('\n');
}

function firstHostLink(
  links: ReadonlyArray<{ readonly url: string }>,
  roots: readonly string[]
): string | null {
  for (const link of links) {
    const host = hostname(link.url);
    if (!host) continue;
    if (roots.some(root => host === root || host.endsWith(`.${root}`)))
      return link.url;
  }
  return null;
}

function instagramHandleFromLinks(
  links: ReadonlyArray<{ readonly url: string }>
): string | null {
  for (const link of links) {
    const host = hostname(link.url);
    if (host !== 'instagram.com') continue;
    try {
      const [first] = new URL(link.url).pathname.split('/').filter(Boolean);
      if (!first || INSTAGRAM_RESERVED.has(first.toLowerCase())) continue;
      return sanitizeHandle(first);
    } catch {
      continue;
    }
  }
  return null;
}

function handleFromUrl(
  url: string,
  platform: PublicLinkPlatform
): string | null {
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const raw =
      platform === 'laylo' || platform === 'linktree' ? parts[0] : parts.at(-1);
    return sanitizeHandle(raw);
  } catch {
    return null;
  }
}

function sanitizeHandle(value: string | null | undefined): string | null {
  const cleaned = (value ?? '')
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  if (!cleaned) return null;
  return cleaned.slice(0, 64);
}

function uniqueLinks(
  urls: readonly string[],
  sourceUrl: string
): Array<{ url: string }> {
  const seen = new Set<string>();
  const links: Array<{ url: string }> = [];
  for (const candidate of urls) {
    const cleaned = httpUrl(candidate);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    links.push({ url: cleaned });
    if (links.length >= MAX_LINKS) break;
  }
  if (!seen.has(sourceUrl) && links.length < MAX_LINKS)
    links.unshift({ url: sourceUrl });
  return links;
}

function httpUrl(value: string): string | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
      return null;
    if (EMAIL_TEST.test(parsed.username)) return null;
    parsed.username = '';
    parsed.password = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

function hostname(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function stripEmails(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = value
    .replace(EMAIL_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return stripped || null;
}

function clip(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length <= max ? value : value.slice(0, max);
}
