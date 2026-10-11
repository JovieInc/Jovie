import { maxDisclosureForAudience } from './certify';
import type { BriefAudience, DisclosureScope, ProofEvent } from './types';

/**
 * Canonical rolling proof feed (JOV-7215).
 *
 * The feed answers "what meaningfully changed in the last N days?" from the
 * shared evidence stores. It emits a deterministic, audience-aware candidate
 * set (one hero + up to three supporting proof points) plus a complete
 * internal ledger recording every input and why it was selected, collapsed,
 * deduplicated, or excluded — the highlight view never hides the ledger.
 *
 * Hard distinctions preserved here:
 * - merged/shipped work ≠ deployed customer capability (a capability claim
 *   requires `deploymentReceipt` in provenance);
 * - observed movement ≠ causal lift (`attributionClass` gates 'direct'
 *   attribution);
 * - missing data ≠ zero (missing baselines/unavailable telemetry exclude a
 *   movement claim, they do not fabricate one);
 * - the requested window is never silently adjusted (anti-cherry-pick).
 */

export type EvidenceType =
  | 'capability'
  | 'execution'
  | 'performance'
  | 'reliability'
  | 'quality'
  | 'activation-growth'
  | 'customer-outcome'
  | 'commercial-outcome';

/**
 * How strongly the record supports attribution. `execution-receipt` proves
 * work happened; `observed` proves a change in the window; `attributed`
 * supports direct attribution; `estimated-incremental` is a modeled lift;
 * `inconclusive` cannot support a causal or movement claim.
 */
export type AttributionClass =
  | 'execution-receipt'
  | 'observed'
  | 'attributed'
  | 'estimated-incremental'
  | 'inconclusive';

export interface ProofProvenance {
  /** Source system, e.g. 'release-receipts', 'product-telemetry'. */
  readonly source: string;
  /** Revision of the source record, when the source is versioned. */
  readonly sourceRevision?: string;
  /**
   * Runtime/deployment receipt id. Required for `capability` evidence: a
   * shipped-capability claim without a deployment receipt is only an
   * execution receipt, never deployed proof.
   */
  readonly deploymentReceipt?: string;
}

/**
 * A raw feed record: the ProofEvent contract plus the provenance and
 * eligibility fields the rolling window needs. Reuses the existing evidence
 * shape so selected candidates feed `composeProofBrief` unchanged — no second
 * proof database.
 */
export interface ProofFeedEntry extends ProofEvent {
  readonly evidenceType: EvidenceType;
  readonly attributionClass: AttributionClass;
  readonly provenance: ProofProvenance;
  /** ISO timestamp after which the record must not be used. */
  readonly expiresAt?: string;
  /**
   * Audiences this record may serve, when narrower than its disclosure
   * scope allows. Absent means any audience within the disclosure ceiling.
   */
  readonly eligibleAudiences?: readonly BriefAudience[];
  /** Required for public-scope disclosure. */
  readonly approvedForPublication?: boolean;
  /**
   * Collapse key: records sharing a key are one user-visible capability, so
   * the feed emits the strongest record rather than N technical changes.
   */
  readonly capabilityKey?: string;
}

export interface RollingFeedRequest {
  readonly audience: BriefAudience;
  readonly subjectEntityId: string;
  /** Inclusive end of the rolling window (ISO date/timestamp). */
  readonly asOf: string;
  /** Window length in days; default 7. */
  readonly windowDays?: number;
  /** Optional extra disclosure clamp on top of the audience ceiling. */
  readonly disclosureScope?: DisclosureScope;
}

export interface RollingWindow {
  /** Explicit bounds; both are ISO timestamps derived only from the request. */
  readonly start: string;
  readonly end: string;
  readonly windowDays: number;
}

export type LedgerDisposition =
  | 'hero'
  | 'supporting'
  | 'unselected'
  | 'collapsed'
  | 'deduplicated'
  | 'excluded';

export type ExclusionReason =
  | 'wrong-subject'
  | 'not-verified'
  | 'out-of-window'
  | 'expired'
  | 'disclosure-bound'
  | 'audience-not-eligible'
  | 'missing-baseline'
  | 'incompatible-denominator'
  | 'conflicting-sources'
  | 'unsupported-causal-claim'
  | 'capability-without-deployment-receipt'
  | 'below-support-bar';

export interface LedgerEntry {
  readonly entryId: string;
  readonly revision: string;
  readonly disposition: LedgerDisposition;
  readonly reason?: ExclusionReason;
  /** For 'collapsed'/'deduplicated': the surviving record id. */
  readonly foldedInto?: string;
  /** Detail for humans reading the ledger. */
  readonly detail?: string;
}

export interface ProofCandidateSet {
  readonly window: RollingWindow;
  readonly audience: BriefAudience;
  readonly subjectEntityId: string;
  readonly disclosureScope: DisclosureScope;
  /** Highest-ranked eligible record; absent when evidence is weak. */
  readonly hero?: ProofFeedEntry;
  /** Up to three records ranked by recipient relevance. */
  readonly supporting: readonly ProofFeedEntry[];
  /** Events (hero + supporting) ready for `composeProofBrief`. */
  readonly candidates: readonly ProofEvent[];
  /**
   * Material caveats from evidence the feed had to surface: contradicted or
   * stale records inside the window bearing on a selected metric predicate.
   */
  readonly caveats: readonly string[];
  /** Complete internal ledger — every input, every disposition. */
  readonly ledger: readonly LedgerEntry[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_WINDOW_DAYS = 7;
const HERO_MIN_RELEVANCE = 0.5;
const SUPPORTER_MIN_RELEVANCE = 0.35;
const MAX_SUPPORTING = 3;

const DISCLOSURE_RANK: Record<DisclosureScope, number> = {
  public: 0,
  internal: 1,
  private: 2,
};

export function rollingWindow(
  asOf: string,
  windowDays: number = DEFAULT_WINDOW_DAYS
): RollingWindow {
  const end = Date.parse(asOf);
  const start = new Date(end - windowDays * DAY_MS).toISOString();
  return { start, end: new Date(end).toISOString(), windowDays };
}

function inWindow(observedAt: string, window: RollingWindow): boolean {
  const t = Date.parse(observedAt);
  return t >= Date.parse(window.start) && t <= Date.parse(window.end);
}

/**
 * First-pass eligibility exclusion. Returns the reason, or null when the
 * record may proceed to dedupe/collapse/ranking.
 */
function exclusionReason(
  e: ProofFeedEntry,
  request: RollingFeedRequest,
  window: RollingWindow,
  scope: DisclosureScope
): ExclusionReason | null {
  if (e.subjectEntityId !== request.subjectEntityId) return 'wrong-subject';
  if (e.status !== 'verified') return 'not-verified';
  if (!inWindow(e.observedAt, window)) return 'out-of-window';
  if (e.expiresAt && Date.parse(e.expiresAt) <= Date.parse(window.end)) {
    return 'expired';
  }
  if (DISCLOSURE_RANK[e.disclosure] > DISCLOSURE_RANK[scope]) {
    return 'disclosure-bound';
  }
  if (
    scope === 'public' &&
    e.disclosure === 'public' &&
    e.approvedForPublication === false
  ) {
    return 'disclosure-bound';
  }
  if (e.eligibleAudiences && !e.eligibleAudiences.includes(request.audience)) {
    return 'audience-not-eligible';
  }
  // A capability claim must carry a runtime/deployment receipt; merged or
  // provider-accepted work alone is not deployed proof.
  if (e.evidenceType === 'capability' && !e.provenance.deploymentReceipt) {
    return 'capability-without-deployment-receipt';
  }
  // Movement claims require a baseline; missing data is unknown, not zero.
  if (
    e.metric &&
    e.metric.after !== undefined &&
    e.metric.before === undefined &&
    e.metric.value === undefined
  ) {
    return 'missing-baseline';
  }
  // 'direct' attribution must be backed by attributed/estimated evidence.
  if (
    e.attribution === 'direct' &&
    e.changed !== undefined &&
    (e.attributionClass === 'observed' || e.attributionClass === 'inconclusive')
  ) {
    return 'unsupported-causal-claim';
  }
  return null;
}

function collapseKey(e: ProofFeedEntry): string {
  return `did:${e.subjectEntityId}:${e.did}`;
}

function metricKey(e: ProofFeedEntry): string | null {
  if (!e.metric) return null;
  return `metric:${e.subjectEntityId}:${e.metric.predicate}:${e.metric.window ?? ''}`;
}

/** Deterministic winner inside a collapse/dedupe group. */
function pickStrongest(
  a: ProofFeedEntry,
  b: ProofFeedEntry,
  audience: BriefAudience
): ProofFeedEntry {
  const ra = a.audienceRelevance[audience] ?? 0;
  const rb = b.audienceRelevance[audience] ?? 0;
  if (ra !== rb) return rb > ra ? b : a;
  if (a.observedAt !== b.observedAt) {
    return b.observedAt > a.observedAt ? b : a;
  }
  const cmp = b.revision.localeCompare(a.revision) || b.id.localeCompare(a.id);
  return cmp < 0 ? a : b;
}

function sameMetricValues(a: ProofFeedEntry, b: ProofFeedEntry): boolean {
  const ma = a.metric!;
  const mb = b.metric!;
  return (
    ma.before === mb.before &&
    ma.after === mb.after &&
    ma.value === mb.value &&
    ma.unit === mb.unit &&
    ma.denominator === mb.denominator
  );
}

/**
 * Select the deterministic candidate set for a rolling window. Pure: the
 * same inputs always produce the same hero, supporting items, caveats, and
 * ledger. Returns fewer items (or no hero) when evidence is weak.
 */
export function selectProofCandidates(
  request: RollingFeedRequest,
  records: readonly ProofFeedEntry[]
): ProofCandidateSet {
  const windowDays = request.windowDays ?? DEFAULT_WINDOW_DAYS;
  const window = rollingWindow(request.asOf, windowDays);
  const audienceCap = maxDisclosureForAudience(request.audience);
  const scope: DisclosureScope =
    request.disclosureScope &&
    DISCLOSURE_RANK[request.disclosureScope] > DISCLOSURE_RANK[audienceCap]
      ? request.disclosureScope
      : audienceCap;

  const ledger = new Map<string, LedgerEntry>();
  const survivors: ProofFeedEntry[] = [];

  for (const e of records) {
    const reason = exclusionReason(e, request, window, scope);
    if (reason) {
      ledger.set(e.id, {
        entryId: e.id,
        revision: e.revision,
        disposition: 'excluded',
        reason,
      });
    } else {
      survivors.push(e);
    }
  }

  // Conflicting & duplicate metric sources: same predicate+window, same
  // subject. Different denominators are incompatible; different verified
  // values are conflicts; identical values dedupe to the strongest record.
  const byMetric = new Map<string, ProofFeedEntry[]>();
  for (const e of survivors) {
    const k = metricKey(e);
    if (k) byMetric.set(k, [...(byMetric.get(k) ?? []), e]);
  }
  const conflicted = new Set<string>();
  for (const group of byMetric.values()) {
    if (group.length < 2) continue;
    const denominators = new Set(group.map(g => g.metric!.denominator ?? ''));
    if (denominators.size > 1) {
      for (const g of group) conflicted.add(g.id);
    } else if (!group.every(g => sameMetricValues(g, group[0]))) {
      for (const g of group) conflicted.add(g.id);
    }
  }

  const deduped: ProofFeedEntry[] = [];
  const collapseGroups = new Map<string, ProofFeedEntry[]>();
  for (const e of survivors) {
    if (conflicted.has(e.id)) {
      ledger.set(e.id, {
        entryId: e.id,
        revision: e.revision,
        disposition: 'excluded',
        reason: denominatorsConflict(e, survivors, conflicted)
          ? 'incompatible-denominator'
          : 'conflicting-sources',
      });
      continue;
    }
    const key = metricKey(e) ?? collapseKey(e);
    collapseGroups.set(key, [...(collapseGroups.get(key) ?? []), e]);
  }

  for (const group of collapseGroups.values()) {
    if (group.length === 1) {
      deduped.push(group[0]);
      continue;
    }
    const winner = group.reduce((a, b) =>
      pickStrongest(a, b, request.audience)
    );
    deduped.push(winner);
    for (const g of group) {
      if (g.id === winner.id) continue;
      ledger.set(g.id, {
        entryId: g.id,
        revision: g.revision,
        disposition: 'deduplicated',
        foldedInto: winner.id,
      });
    }
  }

  // Capability collapse: many technical changes → one user-visible outcome.
  const byCapability = new Map<string, ProofFeedEntry[]>();
  const ranked: ProofFeedEntry[] = [];
  for (const entry of deduped) {
    if (entry.capabilityKey) {
      byCapability.set(entry.capabilityKey, [
        ...(byCapability.get(entry.capabilityKey) ?? []),
        entry,
      ]);
    } else {
      ranked.push(entry);
    }
  }
  for (const group of byCapability.values()) {
    const winner = group.reduce((a, b) =>
      pickStrongest(a, b, request.audience)
    );
    ranked.push(winner);
    for (const g of group) {
      if (g.id === winner.id) continue;
      ledger.set(g.id, {
        entryId: g.id,
        revision: g.revision,
        disposition: 'collapsed',
        foldedInto: winner.id,
      });
    }
  }

  ranked.sort((a, b) => {
    const ra = a.audienceRelevance[request.audience] ?? 0;
    const rb = b.audienceRelevance[request.audience] ?? 0;
    if (ra !== rb) return rb - ra;
    if (a.observedAt !== b.observedAt) {
      return b.observedAt.localeCompare(a.observedAt);
    }
    return a.id.localeCompare(b.id);
  });

  const hero =
    ranked.length > 0 &&
    (ranked[0].audienceRelevance[request.audience] ?? 0) >= HERO_MIN_RELEVANCE
      ? ranked[0]
      : undefined;

  const supporting: ProofFeedEntry[] = [];
  if (hero) {
    ledger.set(hero.id, {
      entryId: hero.id,
      revision: hero.revision,
      disposition: 'hero',
    });
    for (const e of ranked.slice(1)) {
      const rel = e.audienceRelevance[request.audience] ?? 0;
      if (rel < SUPPORTER_MIN_RELEVANCE) {
        ledger.set(e.id, {
          entryId: e.id,
          revision: e.revision,
          disposition: 'excluded',
          reason: 'below-support-bar',
        });
      } else if (supporting.length < MAX_SUPPORTING) {
        supporting.push(e);
        ledger.set(e.id, {
          entryId: e.id,
          revision: e.revision,
          disposition: 'supporting',
        });
      } else {
        ledger.set(e.id, {
          entryId: e.id,
          revision: e.revision,
          disposition: 'unselected',
        });
      }
    }
  } else {
    for (const e of ranked) {
      ledger.set(e.id, {
        entryId: e.id,
        revision: e.revision,
        disposition: 'excluded',
        reason: 'below-support-bar',
      });
    }
  }

  // Anti-cherry-pick: contradicted/stale in-window evidence bearing on a
  // selected predicate must surface as a caveat, not vanish.
  const selectedPredicates = new Set(
    [hero, ...supporting]
      .map(e => e?.metric?.predicate)
      .filter((p): p is string => p !== undefined)
  );
  const caveats: string[] = [];
  for (const e of records) {
    if (e.id === hero?.id || supporting.some(s => s.id === e.id)) continue;
    if (e.subjectEntityId !== request.subjectEntityId) continue;
    if (e.status !== 'contradicted' && e.status !== 'stale') continue;
    if (!inWindow(e.observedAt, window)) continue;
    if (e.metric && selectedPredicates.has(e.metric.predicate)) {
      caveats.push(
        `${e.id}: ${e.status} evidence on '${e.metric.predicate}' — a material negative event that qualifies the selected claim.`
      );
    }
  }
  for (const e of [hero, ...supporting]) {
    if (!e) continue;
    for (const l of e.limitations) caveats.push(`${e.id}: ${l}`);
  }

  return {
    window,
    audience: request.audience,
    subjectEntityId: request.subjectEntityId,
    disclosureScope: scope,
    hero,
    supporting,
    candidates: [hero, ...supporting].filter(
      (e): e is ProofFeedEntry => e !== undefined
    ),
    caveats: caveats.sort((a, b) => a.localeCompare(b)),
    ledger: records.map(
      e =>
        ledger.get(e.id) ?? {
          entryId: e.id,
          revision: e.revision,
          disposition: 'unselected',
        }
    ),
  };
}

function denominatorsConflict(
  e: ProofFeedEntry,
  survivors: readonly ProofFeedEntry[],
  conflicted: ReadonlySet<string>
): boolean {
  const k = metricKey(e);
  if (!k) return false;
  const mates = survivors.filter(
    s => conflicted.has(s.id) && metricKey(s) === k
  );
  return new Set(mates.map(m => m.metric!.denominator ?? '')).size > 1;
}

/**
 * Bridge to the JOV-7216 composer: pre-filtered candidates keep the
 * composer's certification as the backstop. Equivalent to calling
 * `composeProofBrief` on the candidate set with the request's window.
 */
export function feedRequestToBriefRequest(
  request: RollingFeedRequest,
  candidates: readonly ProofEvent[]
): {
  request: {
    audience: BriefAudience;
    subjectEntityId: string;
    windowDays: number;
    asOf: string;
    disclosureScope: DisclosureScope;
  };
  events: readonly ProofEvent[];
} {
  return {
    request: {
      audience: request.audience,
      subjectEntityId: request.subjectEntityId,
      windowDays: request.windowDays ?? DEFAULT_WINDOW_DAYS,
      asOf: request.asOf,
      disclosureScope:
        request.disclosureScope ?? maxDisclosureForAudience(request.audience),
    },
    events: candidates,
  };
}
