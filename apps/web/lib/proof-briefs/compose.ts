import { createHash } from 'node:crypto';
import { certify, isEligible, maxDisclosureForAudience } from './certify';
import type {
  BriefHighlight,
  BriefRequest,
  Certification,
  DisclosureScope,
  ProofBrief,
  ProofEvent,
} from './types';

const HERO_MIN_RELEVANCE = 0.5;
const SUPPORTER_MIN_RELEVANCE = 0.35;
const MAX_SUPPORTING = 3;

function minScope(a: DisclosureScope, b: DisclosureScope): DisclosureScope {
  const rank = { public: 0, internal: 1, private: 2 } as const;
  return rank[a] <= rank[b] ? a : b;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Generated wording: state what was done, then the observed change, and only
 * use causal framing when the evidence carries `direct` attribution. Approved
 * wording, when present, is used verbatim instead.
 */
function generateWording(event: ProofEvent): string {
  const m = event.metric;
  if (m?.before !== undefined && m?.after !== undefined) {
    const direction = m.after < m.before ? 'fell' : 'rose';
    let unit = '';
    if (m.unit === '%') unit = '%';
    else if (m.unit) unit = ` ${m.unit}`;
    const window = m.window ? ` over ${m.window}` : '';
    return `${capitalize(event.did)}. ${m.label} ${direction} from ${formatNumber(m.before)} to ${formatNumber(m.after)}${unit}${window}.`;
  }
  if (event.changed) {
    return `${capitalize(event.did)}. ${capitalize(event.changed)}.`;
  }
  return `${capitalize(event.did)}.`;
}

function toHighlight(event: ProofEvent): BriefHighlight {
  const approved = event.approvedWording !== undefined;
  return {
    eventId: event.id,
    revision: event.revision,
    wording: approved ? event.approvedWording : generateWording(event),
    wordingSource: approved ? 'approved' : 'generated',
    did: event.did,
    changed: event.changed,
    attribution: event.attribution,
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const body = entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(',');
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

/** Hash of the material content; certification metadata is excluded. */
export function briefContentHash(
  brief: Omit<ProofBrief, 'id' | 'contentHash' | 'certification'>
): string {
  return createHash('sha256').update(stableStringify(brief)).digest('hex');
}

export interface ComposeResult {
  /** Null when nothing eligible could support a hero — fail closed. */
  readonly brief: ProofBrief | null;
  readonly rejectedReason?: string;
}

/**
 * Compiles an immutable brief snapshot. Selection is deterministic: the hero
 * is the highest-relevance eligible event; supporters are the next best up to
 * three that clear the quality bar. Material changes to inputs change the
 * content hash, invalidating the snapshot.
 */
export function composeProofBrief(
  request: BriefRequest,
  events: readonly ProofEvent[],
  certifiedAt: string = request.asOf
): ComposeResult {
  const scope = minScope(
    request.disclosureScope,
    maxDisclosureForAudience(request.audience)
  );

  const eligible = events
    .filter(e =>
      isEligible(
        e,
        request.subjectEntityId,
        request.asOf,
        request.windowDays,
        scope
      )
    )
    .sort((a, b) => {
      const ra = a.audienceRelevance[request.audience] ?? 0;
      const rb = b.audienceRelevance[request.audience] ?? 0;
      if (ra !== rb) return rb - ra;
      return b.observedAt.localeCompare(a.observedAt);
    });

  const hero = eligible[0];
  if (
    !hero ||
    (hero.audienceRelevance[request.audience] ?? 0) < HERO_MIN_RELEVANCE
  ) {
    return {
      brief: null,
      rejectedReason: 'no eligible proof event clears the hero bar',
    };
  }

  const supporting = eligible
    .slice(1)
    .filter(
      e =>
        (e.audienceRelevance[request.audience] ?? 0) >= SUPPORTER_MIN_RELEVANCE
    )
    .slice(0, MAX_SUPPORTING);

  const selected = [hero, ...supporting];
  const limitations = new Set<string>();
  for (const e of selected) {
    for (const l of e.limitations) limitations.add(l);
    if (e.changed && e.attribution !== 'direct') {
      limitations.add(
        'Observed in the same window; not attributed to this work.'
      );
    }
    if (e.metric?.denominator) {
      limitations.add(`Denominator: ${e.metric.denominator}.`);
    }
  }

  const content = {
    audience: request.audience,
    subjectEntityId: request.subjectEntityId,
    subjectName: hero.subjectName,
    windowDays: request.windowDays,
    asOf: request.asOf,
    disclosureScope: scope,
    hero: toHighlight(hero),
    supporting: supporting.map(toHighlight),
    evidence: selected.map(e => ({ id: e.id, revision: e.revision })),
    limitations: [...limitations].sort((a, b) => a.localeCompare(b)),
    freshestAsOf: selected.reduce(
      (min, e) => (e.observedAt < min ? e.observedAt : min),
      hero.observedAt
    ),
  };

  const contentHash = briefContentHash(content);
  const draft: ProofBrief = {
    ...content,
    id: `pb_${contentHash.slice(0, 16)}`,
    contentHash,
    certification: undefined as unknown as Certification,
  };
  const certification = certify(draft, events, certifiedAt);
  return { brief: { ...draft, certification } };
}

/** Material change check: recompute and compare the hash. */
export function briefHashMatches(brief: ProofBrief): boolean {
  const { id: _id, contentHash, certification: _c, ...content } = brief;
  return briefContentHash(content) === contentHash;
}

export { disclosureAllowed } from './certify';
