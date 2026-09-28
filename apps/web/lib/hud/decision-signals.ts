/**
 * Decision-value signal ranking for the Ovie ops surface (JOV-5924).
 *
 * Canonical contract + ranking layer that decides which company signals
 * deserve founder attention right now. JOV-5298's three-metric baseline
 * (alive / growth / shipping) remains the fallback and cold-start anchor:
 * `rankDecisionSignals` returns `mode: 'baseline'` whenever ranking inputs
 * are absent or untrusted.
 *
 * A candidate with no plausible decision or action is drill-down, never
 * HUD real estate. Symptom signals sharing a `causeKey` collapse under one
 * owner cause. Deterministic `p0` overrides outrank the explainable score
 * for real safety/revenue failures.
 */
import type { FounderFunnelData } from '@/lib/admin/founder-funnel';
import type { OvieMacHudSnapshot } from '@/lib/hud/ovie-mac-hud';

export const DECISION_RANKING_VERSION = 1;
export const DECISION_HUD_MAX_ITEMS = 7;

export type DecisionSignalTrust = 'fresh' | 'stale' | 'unknown';

export type DecisionSignalActionKind =
  | 'act'
  | 'delegate'
  | 'issue'
  | 'certification'
  | 'inspect';

/**
 * Signal candidate contract. Every source feeding the HUD must expose these
 * fields; `nextAction === null` means "no plausible decision" and the signal
 * is confined to drill-down.
 */
export interface DecisionSignalCandidate {
  /** Stable metric/signal identity. */
  readonly id: string;
  /** Owner or accountable system/person. */
  readonly owner: string;
  /** Source system this fact came from (canonical metrics layer, anomaly feed, …). */
  readonly source: string;
  readonly title: string;
  /** Why this deserves attention right now. */
  readonly whyNow: string;
  /** Current truth, human-readable. */
  readonly currentValue: string;
  readonly delta: string | null;
  readonly target: string | null;
  /** 0–1 confidence in the current reading. */
  readonly confidence: number;
  readonly freshness: DecisionSignalTrust;
  /** Company goal or revenue path this signal gates. */
  readonly goalPath: string;
  readonly causalHypothesis: string | null;
  /** Exact next action/decision this signal can change. Null → drill-down. */
  readonly nextAction: string | null;
  readonly actionKind?: DecisionSignalActionKind;
  readonly actionHref?: string | null;
  /** Certification-inbox card ref; set only when founder judgment is required. */
  readonly certificationRef?: string | null;
  /** 0–1 expected impact of acting. */
  readonly expectedImpact: number;
  /** 0–1 urgency (half-life already folded in). */
  readonly urgency: number;
  /** 0–1 confidence-gap / information gain from founder review. */
  readonly informationGain: number;
  /** 0–1 unblock / risk-reduction value. */
  readonly unblockValue: number;
  /** Founder attention/time cost; must be > 0. */
  readonly attentionCost: number;
  readonly summerCanAct: boolean;
  /** Event that removes or replaces this item. */
  readonly removalEvent: string;
  /** Deterministic override for real P0 safety/revenue failures. */
  readonly priorityOverride?: 'p0' | null;
  /** Groups duplicate/symptom signals under one owner cause. */
  readonly causeKey?: string | null;
}

export interface DecisionScoreFactors {
  readonly expectedImpact: number;
  readonly actionability: number;
  readonly urgency: number;
  readonly informationGain: number;
  readonly unblockValue: number;
  readonly attentionCost: number;
  readonly stalePenalty: number;
}

export interface RankedDecisionItem {
  readonly candidate: DecisionSignalCandidate;
  readonly score: number;
  readonly factors: DecisionScoreFactors;
  readonly rank: number;
  readonly priorityOverride: boolean;
  readonly degraded: boolean;
}

export interface DrillDownSignal {
  readonly id: string;
  readonly title: string;
  readonly reason: 'no_action' | 'duplicate_of' | 'over_limit' | 'untrusted';
  readonly duplicateOf?: string;
}

export interface DecisionHudView {
  readonly mode: 'ranked' | 'baseline';
  readonly rankingVersion: number;
  /** Short explanation of the current ordering/state. */
  readonly explanation: string;
  readonly items: readonly RankedDecisionItem[];
  readonly drillDown: readonly DrillDownSignal[];
  readonly degradedSources: readonly string[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Explainable decision-value score; versioned, not eternal truth. */
export function scoreDecisionSignal(candidate: DecisionSignalCandidate): {
  score: number;
  factors: DecisionScoreFactors;
} {
  const factors: DecisionScoreFactors = {
    expectedImpact: clamp01(candidate.expectedImpact),
    actionability: candidate.nextAction ? 1 : 0,
    urgency: clamp01(candidate.urgency),
    informationGain: clamp01(candidate.informationGain),
    unblockValue: clamp01(candidate.unblockValue),
    attentionCost:
      candidate.attentionCost > 0
        ? candidate.attentionCost
        : Number.POSITIVE_INFINITY,
    stalePenalty: candidate.freshness === 'stale' ? 0.5 : 1,
  };
  const score =
    ((factors.expectedImpact *
      factors.actionability *
      factors.urgency *
      factors.informationGain *
      factors.unblockValue) /
      factors.attentionCost) *
    factors.stalePenalty;
  return { score: Number.isFinite(score) ? score : 0, factors };
}

function isActionable(candidate: DecisionSignalCandidate): boolean {
  return (
    candidate.nextAction != null &&
    candidate.nextAction.trim().length > 0 &&
    candidate.freshness !== 'unknown'
  );
}

function compareItems(a: RankedDecisionItem, b: RankedDecisionItem): number {
  if (a.priorityOverride !== b.priorityOverride) {
    return a.priorityOverride ? -1 : 1;
  }
  if (a.score !== b.score) return b.score - a.score;
  return b.candidate.urgency - a.candidate.urgency;
}

export function rankDecisionSignals(
  candidates: readonly DecisionSignalCandidate[],
  options: { readonly maxItems?: number } = {}
): DecisionHudView {
  const maxItems = Math.min(
    options.maxItems ?? DECISION_HUD_MAX_ITEMS,
    DECISION_HUD_MAX_ITEMS
  );
  const drillDown: DrillDownSignal[] = [];
  const degradedSources: string[] = [];

  const eligible: RankedDecisionItem[] = [];
  for (const candidate of candidates) {
    if (!isActionable(candidate)) {
      if (candidate.freshness === 'unknown') {
        degradedSources.push(candidate.source);
        drillDown.push({
          id: candidate.id,
          title: candidate.title,
          reason: 'untrusted',
        });
      } else {
        drillDown.push({
          id: candidate.id,
          title: candidate.title,
          reason: 'no_action',
        });
      }
      continue;
    }
    if (candidate.freshness === 'stale') degradedSources.push(candidate.source);
    const { score, factors } = scoreDecisionSignal(candidate);
    if (score <= 0 && candidate.priorityOverride !== 'p0') {
      drillDown.push({
        id: candidate.id,
        title: candidate.title,
        reason: 'no_action',
      });
      continue;
    }
    eligible.push({
      candidate,
      score,
      factors,
      rank: 0,
      priorityOverride: candidate.priorityOverride === 'p0',
      degraded: candidate.freshness === 'stale',
    });
  }

  // Dependency/diversity rule: collapse symptoms under their owner cause.
  const byCause = new Map<string, RankedDecisionItem>();
  const ungrouped: RankedDecisionItem[] = [];
  for (const item of eligible) {
    const causeKey = item.candidate.causeKey ?? null;
    if (!causeKey) {
      ungrouped.push(item);
      continue;
    }
    const kept = byCause.get(causeKey);
    if (!kept) {
      byCause.set(causeKey, item);
      continue;
    }
    const [winner, loser] =
      compareItems(item, kept) < 0 ? [item, kept] : [kept, item];
    byCause.set(causeKey, winner);
    drillDown.push({
      id: loser.candidate.id,
      title: loser.candidate.title,
      reason: 'duplicate_of',
      duplicateOf: winner.candidate.id,
    });
  }

  const sorted = [...ungrouped, ...byCause.values()].sort(compareItems);
  const items = sorted.slice(0, maxItems).map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
  for (const overflow of sorted.slice(maxItems)) {
    drillDown.push({
      id: overflow.candidate.id,
      title: overflow.candidate.title,
      reason: 'over_limit',
    });
  }

  if (items.length === 0 && candidates.length === 0) {
    return {
      mode: 'baseline',
      rankingVersion: DECISION_RANKING_VERSION,
      explanation:
        'No decision signals available; showing the JOV-5298 baseline metrics.',
      items,
      drillDown,
      degradedSources,
    };
  }

  return {
    mode: 'ranked',
    rankingVersion: DECISION_RANKING_VERSION,
    explanation:
      items.length === 0
        ? 'No actionable signals right now; healthy state.'
        : `Ranked by expected decision value per unit of founder attention (v${DECISION_RANKING_VERSION}).`,
    items,
    drillDown,
    degradedSources,
  };
}

/** Extra material signals beyond the three-metric snapshot. */
export interface DecisionHudExtras {
  /** Founder funnel: search→claim→activation→payment. */
  readonly funnel?: FounderFunnelData | null;
  /** Minimum acceptable end-to-end funnel conversion (0–1). */
  readonly funnelTargetRate?: number;
  /**
   * Release/dogfood freshness: when a shipped artifact is too stale to
   * dogfood, release freshness temporarily outranks healthy growth metrics.
   */
  readonly releaseFreshness?: {
    readonly staleArtifact: boolean;
    readonly artifactLabel: string;
    readonly lastValidAtIso: string | null;
  } | null;
  /**
   * Capacity truth reconciliation: UI reports capacity available while the
   * underlying accounts/runners are exhausted.
   */
  readonly capacityContradiction?: {
    readonly reportedAvailable: boolean;
    readonly actualExhausted: boolean;
    readonly detail: string;
  } | null;
}

/**
 * Derives signal candidates from the canonical HUD metrics layer — no
 * page-local formula forks. Every emitted fact references its source.
 */
export function candidatesFromOvieMacHud(
  snapshot: OvieMacHudSnapshot,
  extras: DecisionHudExtras = {}
): DecisionSignalCandidate[] {
  const candidates: DecisionSignalCandidate[] = [];
  const generatedAt = snapshot.generatedAtIso;

  if (snapshot.alive.status === 'dead') {
    candidates.push({
      id: 'alive.default-dead',
      owner: 'founder',
      source: 'canonical-metrics:alive',
      title: 'Default dead: burn outruns growth before cash zero',
      whyNow:
        'Current burn and growth do not reach profit before cash hits zero.',
      currentValue: snapshot.alive.detail,
      delta: null,
      target: 'Revenue covers burn, or growth reaches profit inside runway',
      confidence: 1,
      freshness: snapshot.alive.available ? 'fresh' : 'unknown',
      goalPath: 'survival',
      causalHypothesis: 'Revenue growth is not outpacing burn.',
      nextAction:
        'Decide the survival lever: cut burn, accelerate revenue, or raise.',
      actionKind: 'certification',
      expectedImpact: 1,
      urgency: 1,
      informationGain: 0.8,
      unblockValue: 1,
      attentionCost: 1,
      summerCanAct: false,
      removalEvent:
        'Weekly revenue covers burn or growth reaches profit within runway.',
      priorityOverride: 'p0',
      causeKey: 'survival',
    });
  }

  if (
    snapshot.growth.available &&
    snapshot.growth.ycBar === 'not-figured-out'
  ) {
    candidates.push({
      id: 'growth.below-yc-bar',
      owner: 'growth',
      source: 'canonical-metrics:growth',
      title: 'Week-over-week growth below the YC bar',
      whyNow: 'Growth is under the 5%/week good bar; revenue path is weak.',
      currentValue: `${(snapshot.growth.rate * 100).toFixed(1)}% WoW (${snapshot.growth.source})`,
      delta: null,
      target: '≥5%/week good; ≥10%/week exceptional',
      confidence: 1,
      freshness: 'fresh',
      goalPath: 'revenue',
      causalHypothesis: 'Acquisition or activation is the binding constraint.',
      nextAction: 'Ship the next highest-leverage growth experiment.',
      actionKind: 'act',
      expectedImpact: 0.9,
      urgency: 0.7,
      informationGain: 0.5,
      unblockValue: 0.8,
      attentionCost: 2,
      summerCanAct: true,
      removalEvent: 'WoW growth sustains ≥5% with sufficient volume.',
      causeKey: 'revenue-path',
    });
  }

  if (snapshot.shipping.available && snapshot.shipping.shipsThisWeek === 0) {
    candidates.push({
      id: 'shipping.zero-receipted-ships',
      owner: 'delivery',
      source: 'canonical-metrics:shipping',
      title: 'Zero dogfood-receipted ships this week',
      whyNow: 'No Linear→Symphony→MQ→prod receipts landed in 7 days.',
      currentValue: '0 ships this week',
      delta: null,
      target: '≥1 receipted ship/week',
      confidence: 1,
      freshness: 'fresh',
      goalPath: 'delivery',
      causalHypothesis: 'Pipeline blocked or receipts not being emitted.',
      nextAction: 'Inspect the ship pipeline for a stuck stage.',
      actionKind: 'inspect',
      expectedImpact: 0.6,
      urgency: 0.6,
      informationGain: 0.6,
      unblockValue: 0.9,
      attentionCost: 1,
      summerCanAct: true,
      removalEvent: 'A dogfood-receipted ship lands this week.',
      causeKey: 'delivery-pipeline',
    });
  }

  const prs = snapshot.inFlightPullRequests;
  if (prs.availability !== 'available') {
    candidates.push({
      id: 'source.github-prs-degraded',
      owner: 'ops',
      source: 'github',
      title: 'In-flight PR signal degraded',
      whyNow:
        prs.availability === 'not_configured'
          ? 'GitHub HUD source is not configured.'
          : 'GitHub PR signal is failing.',
      currentValue: prs.errorMessage ?? 'Signal unavailable.',
      delta: null,
      target: 'GitHub PR signal available',
      confidence: 1,
      freshness: 'stale',
      goalPath: 'delivery',
      causalHypothesis: 'Missing token/config or GitHub API failure.',
      nextAction: 'Restore the GitHub HUD source.',
      actionKind: 'act',
      expectedImpact: 0.4,
      urgency: 0.4,
      informationGain: 0.4,
      unblockValue: 0.4,
      attentionCost: 3,
      summerCanAct: false,
      removalEvent: 'GitHub PR signal reads available.',
      causeKey: 'source-health',
    });
  }

  const funnel = extras.funnel;
  if (funnel && funnel.errors.length === 0 && funnel.biggestDropOffKey) {
    const first = funnel.stages[0];
    const last = funnel.stages[funnel.stages.length - 1];
    const endToEnd =
      first && last && first.count > 0 ? last.count / first.count : null;
    const target = extras.funnelTargetRate ?? 0.05;
    const bottleneck = funnel.stages.find(
      stage => stage.key === funnel.biggestDropOffKey
    );
    if (endToEnd != null && endToEnd < target && bottleneck) {
      candidates.push({
        id: 'funnel.bottleneck',
        owner: 'growth',
        source: 'canonical-metrics:founder-funnel',
        title: `Activation funnel below target — ${bottleneck.label} is the leak`,
        whyNow: `End-to-end conversion ${(endToEnd * 100).toFixed(1)}% is under the ${(target * 100).toFixed(0)}% target.`,
        currentValue: `${bottleneck.label}: ${bottleneck.dropOff ?? 0} lost`,
        delta:
          bottleneck.conversionRate != null
            ? `${(bottleneck.conversionRate * 100).toFixed(1)}% stage conversion`
            : null,
        target: `End-to-end ≥${(target * 100).toFixed(0)}%`,
        confidence: 1,
        freshness: 'fresh',
        goalPath: 'revenue',
        causalHypothesis: `${bottleneck.label} is the narrowest bottleneck in search→claim→activation→payment.`,
        nextAction: `Run the next experiment/fix against ${bottleneck.label}.`,
        actionKind: 'act',
        expectedImpact: 0.95,
        urgency: 0.85,
        informationGain: 0.6,
        unblockValue: 0.9,
        attentionCost: 1.5,
        summerCanAct: true,
        removalEvent: `End-to-end funnel conversion reaches ≥${(target * 100).toFixed(0)}% or a different stage becomes the bottleneck.`,
        causeKey: 'revenue-path',
      });
    }
  }

  if (extras.releaseFreshness?.staleArtifact) {
    const release = extras.releaseFreshness;
    candidates.push({
      id: 'release.stale-dogfood-artifact',
      owner: 'release',
      source: 'canonical-metrics:release-freshness',
      title: 'Stale desktop artifact invalidates dogfood',
      whyNow: `${release.artifactLabel} is too stale to dogfood; release freshness gates shipping truth.`,
      currentValue: release.lastValidAtIso
        ? `Last valid artifact ${release.lastValidAtIso}`
        : 'No valid artifact',
      delta: null,
      target: 'Fresh dogfoodable artifact',
      confidence: 1,
      freshness: 'fresh',
      goalPath: 'delivery',
      causalHypothesis: 'Release pipeline has not produced a fresh artifact.',
      nextAction: 'Cut a fresh dogfoodable desktop build.',
      actionKind: 'act',
      expectedImpact: 0.7,
      urgency: 0.9,
      informationGain: 0.5,
      unblockValue: 0.9,
      attentionCost: 1,
      summerCanAct: true,
      removalEvent: 'A fresh dogfoodable artifact exists.',
      priorityOverride: 'p0',
      causeKey: 'delivery-pipeline',
    });
  }

  const capacity = extras.capacityContradiction;
  if (capacity?.reportedAvailable && capacity.actualExhausted) {
    candidates.push({
      id: 'capacity.symphony-truth-contradiction',
      owner: 'ops',
      source: 'canonical-metrics:capacity-reconciliation',
      title: 'Symphony capacity contradiction',
      whyNow:
        'UI reports Symphony capacity available but accounts/runners are exhausted.',
      currentValue: capacity.detail,
      delta: null,
      target: 'Reported capacity matches exhausted accounts/runners',
      confidence: 0.9,
      freshness: 'fresh',
      goalPath: 'capacity',
      causalHypothesis: 'Capacity source of truth is unreconciled.',
      nextAction: 'Reconcile the Symphony capacity source and free runners.',
      actionKind: 'act',
      expectedImpact: 0.8,
      urgency: 0.8,
      informationGain: 0.8,
      unblockValue: 1,
      attentionCost: 1,
      summerCanAct: false,
      removalEvent:
        'Reported capacity equals actual runner/account availability.',
      causeKey: 'capacity-truth',
    });
  }

  void generatedAt;
  return candidates;
}

export function composeDecisionHudView(
  snapshot: OvieMacHudSnapshot,
  extras: DecisionHudExtras = {},
  options: { readonly maxItems?: number } = {}
): DecisionHudView {
  return rankDecisionSignals(
    candidatesFromOvieMacHud(snapshot, extras),
    options
  );
}
