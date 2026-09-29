/**
 * JOV-6647 — certification v2 section 8 metrics ("Metrics Summer owns").
 *
 * Pure projection over the existing certification stores: the packet/decision
 * ledger, `jovie.dogfood-receipt/v1` receipts, judge-panel receipts, Summer
 * cards, and the signal roster. No new database — the server adapter
 * (`metrics.server.ts`) assembles {@link CertificationMetricsInput} and this
 * module computes every metric in the spec table
 * (docs/design-system/CERTIFICATION_V2_DOGFOOD.md section 8), per product lane
 * and per risk class. A metric reports `null` when its denominator is empty so
 * an unconnected signal never reads as a certified zero.
 */

import type { FounderCertificationDecisionKind } from '@/lib/agent-os/certification';
import {
  DOGFOOD_PRODUCTS,
  type DogfoodProduct,
  type DogfoodReceipt,
  evaluateDogfoodReliability,
} from '@/lib/agent-os/dogfood-receipt';
import { computeRatePercent } from '@/lib/analytics/metrics';

export const CERTIFICATION_METRICS_CONTRACT =
  'jovie.certification-metrics/v1' as const;

export const CERTIFICATION_RISK_CLASSES = [
  'presentation',
  'product',
  'money_path',
] as const;
export type CertificationRiskClass =
  (typeof CERTIFICATION_RISK_CLASSES)[number];

export const CERTIFICATION_CONFIDENCE_TIERS = [
  'high',
  'medium',
  'low',
] as const;
export type CertificationConfidenceTier =
  (typeof CERTIFICATION_CONFIDENCE_TIERS)[number];

/**
 * Rollout stages in ladder order (spec section 6). Defects first detected at
 * or after `beta` are escaped defects.
 */
export const ROLLOUT_STAGES = [
  'dogfooding',
  'alpha',
  'beta',
  '10%',
  '50%',
  '100%',
] as const;
export type RolloutStage = (typeof ROLLOUT_STAGES)[number];

const ESCAPED_STAGES = new Set<RolloutStage>(['beta', '10%', '50%', '100%']);

export interface FounderBlockingInterval {
  readonly startedAt: string;
  /** Null when the subject is still waiting only on Tim. */
  readonly endedAt: string | null;
}

export interface MetricsSubject {
  readonly id: string;
  readonly product: DogfoodProduct;
  readonly riskClass: CertificationRiskClass;
  /** Missions the identity's assurance profile requires (spec section 4). */
  readonly requiredMissions: readonly { id: string; required?: boolean }[];
  /** The subject's current deploy binding; receipts must match it to count. */
  readonly deploy: { commitSha: string; deploymentId: string } | null;
  /** Confidence tier assigned when the subject entered `human_window`. */
  readonly confidenceTier: CertificationConfidenceTier | null;
  readonly machineCertifiedAt: string | null;
  /** When the rollout ladder reached 100%. Null until it does. */
  readonly fullyRolledOutAt: string | null;
  /** True when `rolling_out` was entered on silence, not a founder decision. */
  readonly promotedSilently: boolean;
  /** True when a kill switch fired after a (silent or not) promotion. */
  readonly killedAfterPromotion: boolean;
  /** True when Tim flagged a defect on a subject after it promoted. */
  readonly founderFlaggedAfterPromotion: boolean;
  /** Intervals where the only missing input was Tim (`human_window` waits). */
  readonly founderBlocking: readonly FounderBlockingInterval[];
  /**
   * Kill-switch events: `failedAt` is the failing receipt time, `flagOffAt`
   * when the subject flag was turned off (spec section 2 same-tick rule).
   */
  readonly killSwitches: readonly { failedAt: string; flagOffAt: string }[];
  /** Judge rung at which the escalation chain resolved; null if carded. */
  readonly escalationRungResolved: number | null;
  /** Whether the subject's surface has a canary route. */
  readonly hasCanary: boolean;
}

export interface MetricsDefect {
  readonly id: string;
  readonly subjectId: string;
  readonly stage: RolloutStage;
  readonly open: boolean;
}

/** A Taste Inbox card that reached Tim after the escalation chain. */
export interface MetricsFounderCard {
  readonly id: string;
  readonly subjectId: string;
  readonly product: DogfoodProduct;
  readonly createdAt: string;
}

/** One `judge_panel` receipt (spec section 5). */
export interface MetricsJudgeReceipt {
  readonly subjectId: string;
  readonly rung: number;
  readonly verdict: 'certify' | 'reject' | 'uncertain';
  readonly costUsd: number | null;
}

export interface MetricsFounderDecision {
  readonly subjectId: string;
  readonly decision: FounderCertificationDecisionKind;
  readonly decidedAt: string;
}

/** One `human_signal` report, weighted by roster tier (spec section 7). */
export interface MetricsSignalReport {
  readonly subjectId: string;
  readonly memberId: string;
  readonly product: DogfoodProduct;
  /** Signed weight actually applied: positive supports, negative opposes. */
  readonly weight: number;
}

export interface MetricsRosterMember {
  readonly id: string;
  readonly products: readonly DogfoodProduct[];
  readonly tier: 'advisor' | 'alpha' | 'beta';
  readonly signalState:
    | 'invited'
    | 'consented'
    | 'calibrating'
    | 'qualified'
    | 'paused'
    | 'retired';
  readonly reportsSent: number;
  readonly repliesReceived: number;
}

export interface CertificationMetricsInput {
  readonly generatedAt: string;
  /** Reporting window for rates like founder cards/day. */
  readonly windowStart: string;
  readonly subjects: readonly MetricsSubject[];
  readonly defects: readonly MetricsDefect[];
  readonly founderCards: readonly MetricsFounderCard[];
  readonly judgeReceipts: readonly MetricsJudgeReceipt[];
  readonly decisions: readonly MetricsFounderDecision[];
  readonly signalReports: readonly MetricsSignalReport[];
  readonly roster: readonly MetricsRosterMember[];
  readonly receipts: readonly DogfoodReceipt[];
  /**
   * Deploy ids known to be good builds; driver reliability is measured as
   * pass rate on exactly these builds (spec section 8).
   */
  readonly knownGoodDeploymentIds: readonly string[];
}

export interface MetricValue {
  /** Null when the denominator is empty — never a fake zero. */
  readonly value: number | null;
  readonly sampleSize: number;
}

export interface JudgeRungCalibration {
  readonly rung: number;
  /** Share of rung verdicts that agree with Tim's decision on the subject. */
  readonly agreementRate: MetricValue;
}

export interface EscalationRungMix {
  readonly rung: number;
  /** Share of escalated subjects that resolved at this rung. */
  readonly share: MetricValue;
  readonly totalCostUsd: number;
}

export interface CycleTimeMetric {
  readonly tier: CertificationConfidenceTier;
  /** Minutes from `machine_certified` to 100%, per spec section 8. */
  readonly p50Minutes: number | null;
  readonly p90Minutes: number | null;
  readonly sampleSize: number;
}

export interface SignalHealthMetric {
  readonly advisors: number;
  readonly qualifiedPoolMembers: number;
  /** repliesReceived / reportsSent across the lane's roster. */
  readonly replyRate: MetricValue;
  /** Share of decided subjects where signal aggregate sign matches Tim. */
  readonly agreementWithTim: MetricValue;
}

export interface CertificationScopeMetrics {
  /** Minutes where the only missing input was Tim. Down. */
  readonly founderBlockingMinutes: number;
  /** Taste Inbox cards reaching Tim after escalation, per day. Down. */
  readonly founderCardsPerDay: MetricValue;
  /** Silent promotions later killed or Tim-flagged, per 100. At most 2. */
  readonly silencePromotionRegretPer100: MetricValue;
  /** Defects first found at or after `beta`, per 100 promotions. Down. */
  readonly escapedDefectsPer100Promotions: MetricValue;
  /** Dogfooding-stage defects over all defects on promoted subjects. Up. */
  readonly dogfoodCatchRate: MetricValue;
  /** Subjects with a reliable agent kind for every required mission. Up. */
  readonly machineCertifiableCoverage: MetricValue;
  /** Mean distinct dogfood kinds with passing receipts per subject. Up. */
  readonly dogfoodKindCoverage: MetricValue;
  /** Pass rate on known-good builds per driver. Up. */
  readonly driverReliability: Readonly<Record<string, MetricValue>>;
  /** Subjects whose surface has a canary route. Up. */
  readonly canaryCoverage: MetricValue;
  /** Agreement of each judge rung with Tim's decisions. Up. */
  readonly judgeCalibration: readonly JudgeRungCalibration[];
  /** Share and cost resolved at each escalation rung. Earlier is better. */
  readonly escalationMix: readonly EscalationRungMix[];
  /** `machine_certified` to 100% cycle time per confidence tier. Down. */
  readonly cycleTime: readonly CycleTimeMetric[];
  /** Failure receipt to flag-off, minutes. Down. */
  readonly killSwitchMttrMinutes: MetricValue;
  readonly signalHealth: SignalHealthMetric;
}

export interface CertificationLaneMetrics extends CertificationScopeMetrics {
  readonly product: DogfoodProduct;
  readonly byRiskClass: Readonly<
    Record<CertificationRiskClass, CertificationScopeMetrics>
  >;
}

export interface CertificationMetricsProjection {
  readonly contract: typeof CERTIFICATION_METRICS_CONTRACT;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly lanes: Readonly<Record<DogfoodProduct, CertificationLaneMetrics>>;
}

const MINUTES_PER_MS = 1 / 60_000;

function minutesBetween(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) * MINUTES_PER_MS);
}

function metric(value: number | null, sampleSize: number): MetricValue {
  return { value, sampleSize };
}

function rate(numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return metric(null, 0);
  return metric(numerator / denominator, denominator);
}

function per100(numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return metric(null, 0);
  // Canonical per-100 rate derivation (analytics-metrics-layer guard).
  return metric(computeRatePercent(numerator, denominator), denominator);
}

function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

interface ScopeFacts {
  readonly subjects: readonly MetricsSubject[];
  readonly defects: readonly MetricsDefect[];
  readonly founderCards: readonly MetricsFounderCard[];
  readonly judgeReceipts: readonly MetricsJudgeReceipt[];
  readonly decisions: readonly MetricsFounderDecision[];
  readonly signalReports: readonly MetricsSignalReport[];
  readonly roster: readonly MetricsRosterMember[];
  readonly receipts: readonly DogfoodReceipt[];
}

function scopeFacts(
  input: CertificationMetricsInput,
  filter: (subject: MetricsSubject) => boolean
): ScopeFacts {
  const subjects = input.subjects.filter(filter);
  const ids = new Set(subjects.map(subject => subject.id));
  const products = new Set(subjects.map(subject => subject.product));
  return {
    subjects,
    defects: input.defects.filter(defect => ids.has(defect.subjectId)),
    founderCards: input.founderCards.filter(
      card => ids.has(card.subjectId) || products.has(card.product)
    ),
    judgeReceipts: input.judgeReceipts.filter(receipt =>
      ids.has(receipt.subjectId)
    ),
    decisions: input.decisions.filter(decision => ids.has(decision.subjectId)),
    signalReports: input.signalReports.filter(
      report => ids.has(report.subjectId) || products.has(report.product)
    ),
    roster: input.roster.filter(member =>
      member.products.some(product => products.has(product))
    ),
    receipts: input.receipts.filter(
      receipt => ids.has(receipt.subjectId) && products.has(receipt.product)
    ),
  };
}

function computeScopeMetrics(
  facts: ScopeFacts,
  input: CertificationMetricsInput
): CertificationScopeMetrics {
  const now = input.generatedAt;

  const founderBlockingMinutes = facts.subjects.reduce(
    (sum, subject) =>
      sum +
      subject.founderBlocking.reduce(
        (inner, interval) =>
          inner + minutesBetween(interval.startedAt, interval.endedAt ?? now),
        0
      ),
    0
  );

  const windowDays = Math.max(
    minutesBetween(input.windowStart, now) / (60 * 24),
    1 / (60 * 24) // never divide by zero; sub-minute windows rate per-minute
  );
  const cardsInWindow = facts.founderCards.filter(
    card =>
      Date.parse(card.createdAt) >= Date.parse(input.windowStart) &&
      Date.parse(card.createdAt) <= Date.parse(now)
  );
  const founderCardsPerDay = metric(
    windowDays > 0 ? cardsInWindow.length / windowDays : null,
    cardsInWindow.length
  );

  const silentPromotions = facts.subjects.filter(
    subject => subject.promotedSilently
  );
  const silentRegrets = silentPromotions.filter(
    subject =>
      subject.killedAfterPromotion || subject.founderFlaggedAfterPromotion
  );
  const silencePromotionRegretPer100 = per100(
    silentRegrets.length,
    silentPromotions.length
  );

  const promoted = facts.subjects.filter(
    subject => subject.fullyRolledOutAt !== null
  );
  const promotedIds = new Set(promoted.map(subject => subject.id));
  const defectsOnPromoted = facts.defects.filter(defect =>
    promotedIds.has(defect.subjectId)
  );
  const escapedDefects = defectsOnPromoted.filter(defect =>
    ESCAPED_STAGES.has(defect.stage)
  );
  const escapedDefectsPer100Promotions = per100(
    escapedDefects.length,
    promoted.length
  );

  const caughtInDogfood = defectsOnPromoted.filter(
    defect => defect.stage === 'dogfooding'
  );
  const dogfoodCatchRate = rate(
    caughtInDogfood.length,
    defectsOnPromoted.length
  );

  const certifiable = facts.subjects.filter(
    subject =>
      subject.deploy !== null &&
      subject.requiredMissions.length > 0 &&
      evaluateDogfoodReliability(
        facts.receipts.filter(receipt => receipt.subjectId === subject.id),
        subject.deploy,
        subject.requiredMissions
      ).machineCertifiable
  );
  const machineCertifiableCoverage = rate(
    certifiable.length,
    facts.subjects.length
  );

  const kindCounts = facts.subjects.map(subject => {
    const kinds = new Set(
      facts.receipts
        .filter(
          receipt =>
            receipt.subjectId === subject.id &&
            receipt.outcome === 'passed' &&
            (subject.deploy === null ||
              (receipt.commitSha === subject.deploy.commitSha &&
                receipt.deploymentId === subject.deploy.deploymentId))
        )
        .map(receipt => receipt.kind)
    );
    return kinds.size;
  });
  const dogfoodKindCoverage = metric(
    facts.subjects.length === 0
      ? null
      : kindCounts.reduce((a, b) => a + b, 0) / facts.subjects.length,
    facts.subjects.length
  );

  const knownGood = new Set(input.knownGoodDeploymentIds);
  const driverReliability: Record<string, MetricValue> = {};
  const byDriver = new Map<string, { passed: number; total: number }>();
  for (const receipt of facts.receipts) {
    if (!knownGood.has(receipt.deploymentId)) continue;
    const bucket = byDriver.get(receipt.driver) ?? { passed: 0, total: 0 };
    bucket.total += 1;
    if (receipt.outcome === 'passed') bucket.passed += 1;
    byDriver.set(receipt.driver, bucket);
  }
  for (const [driver, bucket] of [...byDriver.entries()].sort()) {
    driverReliability[driver] = rate(bucket.passed, bucket.total);
  }

  const canaryCoverage = rate(
    facts.subjects.filter(subject => subject.hasCanary).length,
    facts.subjects.length
  );

  const decisionBySubject = new Map<string, MetricsFounderDecision>();
  for (const decision of [...facts.decisions].sort((a, b) =>
    a.decidedAt.localeCompare(b.decidedAt)
  )) {
    // Latest founder decision on the subject is the calibration label.
    decisionBySubject.set(decision.subjectId, decision);
  }
  const judgeRungs = new Map<number, { agree: number; total: number }>();
  for (const receipt of facts.judgeReceipts) {
    const label = decisionBySubject.get(receipt.subjectId);
    if (!label || receipt.verdict === 'uncertain') continue;
    const agrees =
      (receipt.verdict === 'certify' && label.decision === 'approved') ||
      (receipt.verdict === 'reject' && label.decision !== 'approved');
    const bucket = judgeRungs.get(receipt.rung) ?? { agree: 0, total: 0 };
    bucket.total += 1;
    if (agrees) bucket.agree += 1;
    judgeRungs.set(receipt.rung, bucket);
  }
  const judgeCalibration = [...judgeRungs.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rung, bucket]) => ({
      rung,
      agreementRate: rate(bucket.agree, bucket.total),
    }));

  const escalated = facts.subjects.filter(
    subject => subject.escalationRungResolved !== null
  );
  const rungCounts = new Map<number, number>();
  for (const subject of escalated) {
    const rung = subject.escalationRungResolved as number;
    rungCounts.set(rung, (rungCounts.get(rung) ?? 0) + 1);
  }
  const escalationMix = [...rungCounts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rung, count]) => ({
      rung,
      share: rate(count, escalated.length),
      totalCostUsd: facts.judgeReceipts
        .filter(receipt => receipt.rung === rung)
        .reduce((sum, receipt) => sum + (receipt.costUsd ?? 0), 0),
    }));

  const cycleTime = CERTIFICATION_CONFIDENCE_TIERS.map(tier => {
    const durations = facts.subjects
      .filter(
        subject =>
          subject.confidenceTier === tier &&
          subject.machineCertifiedAt !== null &&
          subject.fullyRolledOutAt !== null
      )
      .map(subject =>
        minutesBetween(
          subject.machineCertifiedAt as string,
          subject.fullyRolledOutAt as string
        )
      )
      .sort((a, b) => a - b);
    return {
      tier,
      p50Minutes: percentile(durations, 50),
      p90Minutes: percentile(durations, 90),
      sampleSize: durations.length,
    };
  });

  const killIntervals = facts.subjects
    .flatMap(subject => subject.killSwitches)
    .map(event => minutesBetween(event.failedAt, event.flagOffAt))
    .sort((a, b) => a - b);
  const killSwitchMttrMinutes = metric(
    killIntervals.length === 0
      ? null
      : killIntervals.reduce((a, b) => a + b, 0) / killIntervals.length,
    killIntervals.length
  );

  const advisors = facts.roster.filter(
    member =>
      member.tier === 'advisor' &&
      member.signalState !== 'retired' &&
      member.signalState !== 'paused'
  ).length;
  const qualifiedPool = facts.roster.filter(
    member =>
      (member.tier === 'alpha' || member.tier === 'beta') &&
      member.signalState === 'qualified'
  ).length;
  const sent = facts.roster.reduce((sum, m) => sum + m.reportsSent, 0);
  const replied = facts.roster.reduce((sum, m) => sum + m.repliesReceived, 0);

  const signalBySubject = new Map<string, number>();
  for (const report of facts.signalReports) {
    signalBySubject.set(
      report.subjectId,
      (signalBySubject.get(report.subjectId) ?? 0) + report.weight
    );
  }
  let agreeCount = 0;
  let agreeTotal = 0;
  for (const [subjectId, aggregate] of signalBySubject) {
    const label = decisionBySubject.get(subjectId);
    if (!label) continue;
    agreeTotal += 1;
    if (
      (label.decision === 'approved' && aggregate > 0) ||
      (label.decision !== 'approved' && aggregate < 0)
    ) {
      agreeCount += 1;
    }
  }

  return {
    founderBlockingMinutes,
    founderCardsPerDay,
    silencePromotionRegretPer100,
    escapedDefectsPer100Promotions,
    dogfoodCatchRate,
    machineCertifiableCoverage,
    dogfoodKindCoverage,
    driverReliability,
    canaryCoverage,
    judgeCalibration,
    escalationMix,
    cycleTime,
    killSwitchMttrMinutes,
    signalHealth: {
      advisors,
      qualifiedPoolMembers: qualifiedPool,
      replyRate: rate(replied, sent),
      agreementWithTim: rate(agreeCount, agreeTotal),
    },
  };
}

/**
 * Compute the full section 8 projection: every metric per product lane, plus
 * a per-risk-class breakdown inside each lane.
 */
export function computeCertificationMetrics(
  input: CertificationMetricsInput
): CertificationMetricsProjection {
  const lanes = Object.fromEntries(
    DOGFOOD_PRODUCTS.map(product => {
      const laneFacts = scopeFacts(
        input,
        subject => subject.product === product
      );
      const byRiskClass = Object.fromEntries(
        CERTIFICATION_RISK_CLASSES.map(riskClass => [
          riskClass,
          computeScopeMetrics(
            scopeFacts(
              input,
              subject =>
                subject.product === product && subject.riskClass === riskClass
            ),
            input
          ),
        ])
      ) as Record<CertificationRiskClass, CertificationScopeMetrics>;
      return [
        product,
        {
          product,
          ...computeScopeMetrics(laneFacts, input),
          byRiskClass,
        },
      ];
    })
  ) as Record<DogfoodProduct, CertificationLaneMetrics>;

  return {
    contract: CERTIFICATION_METRICS_CONTRACT,
    generatedAt: input.generatedAt,
    windowStart: input.windowStart,
    lanes,
  };
}
