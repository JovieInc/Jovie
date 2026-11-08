/**
 * Buyer pre-screen: a free, pure check on what an artist's public link page
 * already shows, run before the pipeline spends a paid search or enrichment
 * call on them.
 *
 * It answers one question: does this page show money already going to tools
 * Jovie replaces (smart links, fan CRM, email/SMS capture, link-in-bio
 * upgrades), or a budget to buy them (touring, a paid merch store, ads, a
 * team, label backing)? Follower counts are deliberately not an input: reach
 * without spend is not a buyer.
 *
 * Evidence boundary: a tool link proves usage, not a paid plan (see
 * PUBLIC_SIGNAL_POLICY_REGISTRY in ./job-qualification). This module ranks and
 * filters candidates; it never writes `hasPaidTier` or any paid-access claim.
 */

import {
  BUYER_SIGNAL_WEIGHTS,
  type BuyerSignalCategory,
  DSP_PROVIDERS,
  DSP_TEXT_PATTERN,
  HOST_RULES,
  JOVIE_HOSTS,
  TEXT_RULES,
  type WeightId,
} from './buyer-signal-rules';
import { possibleNonArtist } from './entity-eligibility';

export type { BuyerSignalCategory } from './buyer-signal-rules';
export { BUYER_SIGNAL_WEIGHTS } from './buyer-signal-rules';

export interface PublicLinkPage {
  readonly handle: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  /** Other visible text: link titles, or a search result's title + snippet. */
  readonly text?: string | null;
  readonly links: ReadonlyArray<{ readonly url: string }>;
  /** Source-reported; null/undefined when the source cannot tell. */
  readonly hasTrackingPixels?: boolean | null;
  readonly brandingRemoved?: boolean | null;
}

export interface BuyerSignal {
  readonly id: string;
  readonly category: BuyerSignalCategory;
  readonly weight: number;
  readonly reason: string;
  readonly evidence: string;
}

export type PrescreenHardStop =
  | 'excluded_identity'
  | 'already_on_jovie'
  | 'non_artist'
  | 'no_music_presence';

export interface BuyerPrescreenResult {
  readonly decision: 'pass' | 'fail';
  readonly score: number;
  readonly hardStop: PrescreenHardStop | null;
  readonly signals: readonly BuyerSignal[];
  /** Human-readable, one line per signal or stop, strongest first. */
  readonly reasons: readonly string[];
  /** Ids of replaced-tool signals: what a Jovie pitch would replace. */
  readonly replacedTools: readonly string[];
}

export interface BuyerPrescreenOptions {
  /** Handles never to treat as buyers (founder, staff, test pages). */
  readonly excludedHandles?: readonly string[];
  readonly passScore?: number;
}

/** Minimum total score for a pass (spend evidence is also required). */
export const PRESCREEN_PASS_SCORE = 25;
/** Budget-only candidates (no replaced tool) need this much budget weight. */
export const PRESCREEN_MIN_BUDGET_WEIGHT = 15;

function hostOf(url: string): { host: string; path: string } | null {
  try {
    const parsed = new URL(url.includes('://') ? url : `https://${url}`);
    return {
      host: parsed.hostname.toLowerCase().replace(/^www\./, ''),
      path: parsed.pathname,
    };
  } catch {
    return null;
  }
}

const matchesHost = (host: string, roots: readonly string[]) =>
  roots.some(root => host === root || host.endsWith(`.${root}`));

/** Bare domains mentioned in free text (snippets often show "ffm.to/x"). */
function urlsInText(text: string): string[] {
  return (
    text.match(
      /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s"'<>)]*)?/gi
    ) ?? []
  );
}

export function prescreenBuyer(
  page: PublicLinkPage,
  options: BuyerPrescreenOptions = {}
): BuyerPrescreenResult {
  const text = [page.displayName, page.bio, page.text]
    .filter(Boolean)
    .join('\n');
  const urls = [...page.links.map(link => link.url), ...urlsInText(text)];
  const parsed = urls
    .map(hostOf)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const handle = page.handle.replace(/^@+/, '').trim().toLowerCase();

  const stop = (
    hardStop: PrescreenHardStop,
    reason: string
  ): BuyerPrescreenResult => ({
    decision: 'fail',
    score: 0,
    hardStop,
    signals: [],
    reasons: [reason],
    replacedTools: [],
  });

  const excluded = (options.excludedHandles ?? []).map(h =>
    h.replace(/^@+/, '').toLowerCase()
  );
  if (excluded.includes(handle))
    return stop(
      'excluded_identity',
      'excluded identity (founder, staff or test page)'
    );
  if (parsed.some(p => matchesHost(p.host, JOVIE_HOSTS)))
    return stop('already_on_jovie', 'already links a Jovie page');
  const nonArtist = possibleNonArtist({
    handle,
    displayName: page.displayName,
    bio: page.bio,
  });
  if (nonArtist)
    return stop('non_artist', `not an independent artist (${nonArtist})`);

  const signals: BuyerSignal[] = [];
  const add = (
    id: WeightId,
    category: BuyerSignalCategory,
    reason: string,
    evidence: string
  ) => {
    if (signals.some(signal => signal.id === id)) return;
    signals.push({
      id,
      category,
      weight: BUYER_SIGNAL_WEIGHTS[id],
      reason,
      evidence,
    });
  };

  const releaseLinks = new Set<string>();
  for (const { host, path } of parsed) {
    for (const rule of HOST_RULES) {
      if (
        !matchesHost(host, rule.hosts) ||
        (rule.path && !rule.path.test(path))
      )
        continue;
      add(rule.id, rule.category, rule.label, host);
      if (rule.releaseLink && path.length > 1)
        releaseLinks.add(`${host}${path.toLowerCase()}`);
    }
  }
  const dspHosts = new Set(
    parsed.flatMap(p =>
      Object.entries(DSP_PROVIDERS)
        .filter(([, hosts]) => matchesHost(p.host, hosts))
        .map(([provider]) => provider)
    )
  );
  if (
    dspHosts.size === 0 &&
    releaseLinks.size === 0 &&
    !DSP_TEXT_PATTERN.test(text)
  ) {
    return stop(
      'no_music_presence',
      'no streaming or release link on the page (dead or non-music page)'
    );
  }

  for (const rule of TEXT_RULES) {
    const match = text.match(rule.pattern);
    if (match) add(rule.id, 'budget', rule.label, match[0].trim().slice(0, 60));
  }
  if (page.hasTrackingPixels)
    add('paid_ads_pixel', 'budget', 'runs paid ads (tracking pixel)', 'pixel');
  if (page.brandingRemoved)
    add(
      'link_in_bio_branding_removed',
      'replaced_tool',
      'link-in-bio branding removed (paid plan likely, unconfirmed)',
      'branding'
    );
  if (releaseLinks.size >= 3)
    add(
      'release_cadence',
      'activity',
      `active release cadence (${releaseLinks.size} release links)`,
      `${releaseLinks.size} links`
    );
  if (dspHosts.size >= 3)
    add(
      'multi_dsp',
      'activity',
      `on ${dspHosts.size} streaming services`,
      [...dspHosts].join(',')
    );

  signals.sort((a, b) => b.weight - a.weight);
  const score = Math.min(
    100,
    signals.reduce((sum, s) => sum + s.weight, 0)
  );
  const replacedTools = signals
    .filter(s => s.category === 'replaced_tool')
    .map(s => s.id);
  const budgetWeight = signals
    .filter(s => s.category === 'budget')
    .reduce((sum, s) => sum + s.weight, 0);
  const hasSpend =
    replacedTools.length > 0 || budgetWeight >= PRESCREEN_MIN_BUDGET_WEIGHT;
  const passes =
    hasSpend && score >= (options.passScore ?? PRESCREEN_PASS_SCORE);
  const reasons = signals.map(s => `${s.reason} (+${s.weight})`);
  if (!hasSpend)
    reasons.push(
      'no spend signal: no replaced tool and too little budget evidence'
    );
  else if (!passes) reasons.push(`score ${score} below pass mark`);

  return {
    decision: passes ? 'pass' : 'fail',
    score,
    hardStop: null,
    signals,
    reasons,
    replacedTools,
  };
}
