/**
 * Search-side tool detection: qualify Linktree and Beacons leads from what a
 * search engine showed about their page, never by reading the page.
 *
 * Linktree and Beacons HTML is off-limits to Jovie (social-html-policy.ts,
 * docs/network-support-matrix.md). A SerpAPI query such as
 * `site:linktr.ee "laylo.com"` only returns pages Google matched against that
 * quoted domain, so each hit is evidence the page links the tool. The evidence
 * is stored on the lead at discovery and scored here with the same buyer
 * pre-screen, pass mark and hard stops discovery uses.
 */

import type {
  LeadSearchEvidence,
  LeadSignalSnapshot,
} from '@/lib/db/schema/leads';
import { HOST_RULES, type HostRule } from './buyer-signal-rules';
import {
  type BuyerPrescreenResult,
  prescreenBuyer,
  prescreenFailReason,
} from './buyer-signals';
import type { SearchProviderName } from './google-cse';

/** Link-page hosts the finder searches; their HTML is never fetched. */
export const LINK_PAGE_SEARCH_SITES = ['linktr.ee', 'beacons.ai'] as const;

/** Most search results kept per lead; the oldest drop off first. */
export const MAX_SEARCH_EVIDENCE_PER_LEAD = 20;

const LINK_PAGE_HOST_PATTERN =
  /(^|\.)(linktr\.ee|linktree\.com|beacons\.ai|beacons\.page)$/;

/**
 * Spend footprints a quoted domain can name: the buyer-signal rules for
 * replaced tools and budget. Activity rules are not spend, and a rule that
 * also needs a URL path (DistroKid HyperFollow) cannot be named by domain.
 */
const SEARCHABLE_SPEND_RULES: readonly HostRule[] = HOST_RULES.filter(
  rule => rule.category !== 'activity' && !rule.path
);

/**
 * One query per spend rule (its first host) per link-page site, built from
 * the buyer-signal rules so a new rule gets searched without a second list.
 */
export function buildToolSearchQueries(): string[] {
  return SEARCHABLE_SPEND_RULES.flatMap(rule =>
    LINK_PAGE_SEARCH_SITES.map(site => `site:${site} "${rule.hosts[0]}"`)
  );
}

const matchesHost = (host: string, roots: readonly string[]) =>
  roots.some(root => host === root || host.endsWith(`.${root}`));

/**
 * Domains a keyword quotes, e.g. `site:linktr.ee "ffm.to"`. Google (SerpAPI)
 * returns only pages that contain a quoted term, so each result carries that
 * footprint even when its snippet does not show it. Exa is semantic and does
 * not honour quotes, so its results get no query-implied evidence.
 */
export function queryImpliedDomains(
  query: string,
  provider: SearchProviderName
): string[] {
  if (provider !== 'serpapi') return [];
  return [...query.matchAll(/"([a-z0-9-]+(?:\.[a-z0-9-]+)+)"/gi)]
    .map(match => match[1]!.toLowerCase())
    .filter(domain => !LINK_PAGE_HOST_PATTERN.test(domain));
}

/** Buyer-signal rule ids that a set of domains matches. */
export function toolsForDomains(domains: readonly string[]): string[] {
  const tools = new Set<string>();
  for (const domain of domains) {
    for (const rule of HOST_RULES) {
      if (!rule.path && matchesHost(domain, rule.hosts)) tools.add(rule.id);
    }
  }
  return [...tools].sort(); // NOSONAR (typescript:S2871) - ids are ASCII; code-unit order is the intended stable order.
}

/** A search result title minus the link-page brand suffix. */
export function cleanSearchTitle(title: string | null | undefined): string {
  return (title ?? '')
    .replace(/\s*[|\-–]\s*(linktree|beacons(\.ai)?)\s*$/i, '')
    .trim();
}

export function buildSearchEvidence(input: {
  query: string;
  provider: SearchProviderName;
  title: string | null | undefined;
  snippet: string | null | undefined;
  observedAt?: Date;
}): LeadSearchEvidence {
  const domains = queryImpliedDomains(input.query, input.provider);
  return {
    source: 'search_match',
    query: input.query,
    provider: input.provider,
    tools: toolsForDomains(domains),
    domains,
    title: cleanSearchTitle(input.title) || null,
    snippet: input.snippet?.trim() || null,
    observedAt: (input.observedAt ?? new Date()).toISOString(),
  };
}

/**
 * Adds new search results to a lead's evidence. A query seen again replaces
 * its older entry, so evidence accumulates per query, capped per lead.
 */
export function mergeSearchEvidence(
  existing: readonly LeadSearchEvidence[] | null | undefined,
  incoming: readonly LeadSearchEvidence[]
): LeadSearchEvidence[] {
  const incomingQueries = new Set(incoming.map(entry => entry.query));
  const kept = (existing ?? []).filter(
    entry => !incomingQueries.has(entry.query)
  );
  return [...kept, ...incoming].slice(-MAX_SEARCH_EVIDENCE_PER_LEAD);
}

/** Every tool any stored search result matched, deduplicated. */
export function evidenceTools(
  evidence: readonly LeadSearchEvidence[]
): string[] {
  return [...new Set(evidence.flatMap(entry => entry.tools))].sort(); // NOSONAR (typescript:S2871) - ids are ASCII; code-unit order is the intended stable order.
}

/** The snapshot a newly discovered lead starts with: search evidence only. */
export function discoverySignalSnapshot(input: {
  query: string;
  sourcePlatform: 'linktree' | 'beacons';
  evidence: LeadSearchEvidence;
}): LeadSignalSnapshot {
  return {
    verified: null,
    hasPaidTier: null,
    hasSpotifyLink: false,
    hasInstagram: false,
    musicToolsDetected: [],
    allLinks: [],
    hasTrackingPixels: false,
    trackingPixelPlatforms: [],
    discoveryQuery: input.query,
    sourcePlatform: input.sourcePlatform,
    searchEvidence: [input.evidence],
  };
}

/**
 * Pre-screens a link page from search results alone: the latest title as the
 * name, the snippets as visible text, the quoted domains as footprints. The
 * page was never seen in full, so a missing streaming link is unknown.
 */
export function prescreenFromSearchEvidence(input: {
  handle: string;
  displayName: string | null;
  evidence: readonly LeadSearchEvidence[];
}): BuyerPrescreenResult {
  const latestTitle =
    [...input.evidence].reverse().find(entry => entry.title)?.title ?? null;
  const snippets = input.evidence
    .map(entry => entry.snippet)
    .filter((snippet): snippet is string => Boolean(snippet));
  return prescreenBuyer(
    {
      handle: input.handle,
      displayName: input.displayName ?? latestTitle,
      bio: snippets.length > 0 ? snippets.join('\n') : null,
      text: input.evidence.flatMap(entry => entry.domains).join(' '),
      links: [],
    },
    { pageSeenInFull: false }
  );
}

export type SearchEvidenceQualification =
  | { readonly outcome: 'no_evidence' }
  | {
      readonly outcome: 'qualified' | 'disqualified';
      readonly prescreen: BuyerPrescreenResult;
      readonly displayName: string | null;
      readonly fitScore: number;
      readonly fitScoreBreakdown: Record<string, unknown>;
      readonly musicToolsDetected: string[];
      readonly disqualificationReason: string | null;
    };

/**
 * Qualifies a link-page lead from stored search evidence. No evidence means
 * no decision: the lead stays discovered until a search shows its page.
 */
export function qualifyFromSearchEvidence(input: {
  handle: string;
  displayName: string | null;
  evidence: readonly LeadSearchEvidence[] | null | undefined;
}): SearchEvidenceQualification {
  const evidence = input.evidence ?? [];
  if (evidence.length === 0) return { outcome: 'no_evidence' };

  const prescreen = prescreenFromSearchEvidence({
    handle: input.handle,
    displayName: input.displayName,
    evidence,
  });
  const passed = prescreen.decision === 'pass';
  return {
    outcome: passed ? 'qualified' : 'disqualified',
    prescreen,
    displayName:
      input.displayName ??
      [...evidence].reverse().find(entry => entry.title)?.title ??
      null,
    fitScore: prescreen.score,
    fitScoreBreakdown: {
      scorer: 'buyer_prescreen',
      source: 'search_evidence',
      score: prescreen.score,
      reasons: prescreen.reasons,
      signals: prescreen.signals,
      searchTools: evidenceTools(evidence),
      queries: evidence.map(entry => entry.query),
    },
    musicToolsDetected: [...prescreen.replacedTools].sort(), // NOSONAR (typescript:S2871) - ids are ASCII; code-unit order is the intended stable order.
    disqualificationReason: passed ? null : prescreenFailReason(prescreen),
  };
}
