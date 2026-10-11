import {
  type CertificationAdmission,
  type CertificationBlocker,
  type CertificationEvidenceReceipt,
  type CertificationOperationalEvidenceTier,
  type CertificationReviewPacket,
  type CertificationState,
  type CertificationSubject,
  type FounderCertificationDecisionKind,
} from './certification';

/**
 * Unified Ovi certification inbox (JOV-5919): one ranked founder-judgment
 * queue projected from every domain's `jovie.certification/v1` admission.
 *
 * Domain adapters (marketing components, acquisition candidates, features,
 * design-system objects, experiments) emit `CertificationInboxDelivery`s;
 * this projection dedupes deliveries by subject, keeps only the newest
 * revision, and returns a single cross-domain ranking. It holds no state of
 * its own — decision persistence stays in the existing per-domain CAS stores.
 */
export const CERTIFICATION_INBOX_CONTRACT =
  'jovie.certification-inbox/v1' as const;

export const CERTIFICATION_INBOX_ACTIONS = [
  'certify',
  'reject',
  'modify',
  'request_evidence',
] as const;

export type CertificationInboxAction =
  (typeof CERTIFICATION_INBOX_ACTIONS)[number];

export type CertificationInboxBucket =
  | 'needs_you'
  | 'blocked'
  | 'stale'
  | 'returned'
  | 'certified'
  | 'superseded';

/**
 * Expected-decision-value signals supplied by the emitting domain. Each
 * signal is a 0..10-ish weight; missing signals contribute nothing.
 * `founderMinutes` is the estimated founder time and breaks ties in favor of
 * cheaper decisions.
 */
export interface CertificationInboxRankingSignals {
  readonly urgency?: number;
  readonly impact?: number;
  readonly unblockValue?: number;
  readonly riskReduction?: number;
  readonly confidenceGap?: number;
  readonly founderMinutes?: number;
}

/**
 * Revenue-cone tiers for the $5K sprint (JOV-7695), ranked before any score:
 * 1. first-dollar blocker where the founder is the remaining blocker;
 * 2. live revenue-path regression that needs judgment;
 * 3. human certification on stranger → claim/signup → $199 → paid → activated;
 * 4. high-traffic or high-impact non-revenue surface;
 * 5. everything else.
 */
export const CERTIFICATION_INBOX_REVENUE_TIERS = [
  'first_dollar_blocker',
  'revenue_path_regression',
  'revenue_path_certification',
  'high_impact_surface',
  'other',
] as const;

export type CertificationInboxRevenueTier =
  (typeof CERTIFICATION_INBOX_REVENUE_TIERS)[number];

export interface CertificationInboxRevenue {
  readonly tier: CertificationInboxRevenueTier;
  /** The user or revenue path a decision unblocks, in plain words. */
  readonly unblocks?: string;
}

/**
 * Required machine evidence a domain checks outside the packet (for example
 * ACQUISITION_ELIGIBLE for outreach prospects). Anything but green keeps the
 * item out of the founder queue.
 */
export interface CertificationInboxMachineEvidence {
  readonly status: 'green' | 'red' | 'unknown';
  readonly summary: string;
}

export interface CertificationInboxDelivery {
  /** Typed projection domain, e.g. 'marketing_component' or 'artist_candidate'. */
  readonly domain: string;
  readonly packet: CertificationReviewPacket;
  readonly admission: CertificationAdmission;
  /** ISO timestamp identifying this delivery's revision freshness. */
  readonly observedAt: string;
  readonly ranking?: CertificationInboxRankingSignals;
  /** Exact decision the machine is asking for, e.g. 'certify publish to cohort'. */
  readonly requestedDecision?: string | null;
  /** Producer-declared revenue tier; otherwise derived from domain/subject. */
  readonly revenue?: CertificationInboxRevenue;
  readonly machineEvidence?: CertificationInboxMachineEvidence;
}

/**
 * The six things a founder card must answer (JOV-7695). Present on every
 * needs-you item; null elsewhere because nothing is being asked.
 */
export interface CertificationInboxCard {
  readonly whyNow: string;
  readonly journey: string;
  /** Exact source revision the decision binds to, e.g. `main@abc123`. */
  readonly revision: string | null;
  readonly greenEvidence: readonly string[];
  readonly unblocks: string;
  readonly decision: string;
  readonly consequences: {
    readonly accept: string;
    readonly reject: string;
    readonly comment: string;
  };
}

export interface CertificationInboxItem {
  readonly contract: typeof CERTIFICATION_INBOX_CONTRACT;
  readonly domain: string;
  readonly subject: CertificationSubject;
  readonly state: CertificationState;
  readonly bucket: CertificationInboxBucket;
  readonly decisionEvidenceDigest: string | null;
  readonly decisionScore: number;
  readonly estimatedFounderMinutes: number;
  readonly requestedDecision: string | null;
  readonly lastDecision: FounderCertificationDecisionKind | null;
  readonly staleFounderLock: boolean;
  readonly blockers: readonly CertificationBlocker[];
  readonly actions: readonly CertificationInboxAction[];
  readonly observedAt: string;
  /** 1 = first-dollar blocker … 5 = everything else. Ranks before score. */
  readonly revenueTierRank: number;
  readonly revenueTier: CertificationInboxRevenueTier;
  /** True when required machine evidence is red/unknown (held from founder). */
  readonly heldForMachineEvidence: boolean;
  readonly card: CertificationInboxCard | null;
}

export interface CertificationInboxQueue {
  readonly contract: typeof CERTIFICATION_INBOX_CONTRACT;
  /**
   * Ranked founder-judgment queue: review-ready items whose required machine
   * evidence is green, ordered by revenue tier, then decision score. Empty
   * means no founder decision is actionable now, not that nothing is running.
   */
  readonly needsYou: readonly CertificationInboxItem[];
  /**
   * Working/blocked items with explicit blocker evidence, including
   * review-ready items held because machine evidence is red or unknown.
   */
  readonly blocked: readonly CertificationInboxItem[];
  /** Items whose prior founder approval no longer matches the digest. */
  readonly stale: readonly CertificationInboxItem[];
  /** Rejected or changes-requested items returned to remediation. */
  readonly returned: readonly CertificationInboxItem[];
  /** Browsable catalog of machine/founder-certified healthy objects. */
  readonly certified: readonly CertificationInboxItem[];
  /** Older deliveries superseded by a newer revision of the same subject. */
  readonly superseded: readonly CertificationInboxItem[];
}

function signalWeight(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function certificationDecisionScore(
  signals: CertificationInboxRankingSignals | undefined
): number {
  if (!signals) return 0;
  return (
    signalWeight(signals.urgency) +
    signalWeight(signals.impact) +
    signalWeight(signals.unblockValue) +
    signalWeight(signals.riskReduction) +
    signalWeight(signals.confidenceGap)
  );
}

function estimatedFounderMinutes(
  signals: CertificationInboxRankingSignals | undefined
): number {
  if (!signals?.founderMinutes || !Number.isFinite(signals.founderMinutes)) {
    return 0;
  }
  return Math.max(0, signals.founderMinutes);
}

const OPERATIONAL_TIERS = {
  ci: 'ci',
  queueMerge: 'queue_merge',
  deploy: 'deploy',
  runtimeDogfood: 'runtime_dogfood',
} as const satisfies Record<
  keyof NonNullable<CertificationReviewPacket['operational']>,
  CertificationOperationalEvidenceTier
>;

function operationalReceipts(
  packet: CertificationReviewPacket
): CertificationEvidenceReceipt[] {
  const operational = packet.operational ?? {};
  return (
    Object.keys(OPERATIONAL_TIERS) as (keyof typeof OPERATIONAL_TIERS)[]
  ).flatMap(key => [...(operational[key] ?? [])]);
}

/**
 * Machine evidence a founder decision depends on but the kernel does not
 * require for review-ready: any operational receipt the packet declares (CI,
 * merge, deploy, runtime dogfood) and any domain-level evidence. Red or
 * unknown holds the item from the founder queue (fail closed).
 */
function machineEvidenceBlockers(
  delivery: CertificationInboxDelivery
): CertificationBlocker[] {
  const blockers: CertificationBlocker[] = operationalReceipts(delivery.packet)
    .filter(receipt => receipt.status !== 'passed')
    .map(receipt => ({
      code:
        receipt.status === 'failed'
          ? `${receipt.tier as CertificationOperationalEvidenceTier}_failed`
          : `${receipt.tier as CertificationOperationalEvidenceTier}_missing`,
      id: receipt.id,
      summary: `${receipt.tier} receipt is ${receipt.status}: ${receipt.summary}`,
      tier: receipt.tier,
    }));
  const machine = delivery.machineEvidence;
  if (machine && machine.status !== 'green') {
    blockers.push({
      code:
        machine.status === 'red'
          ? 'machine_evidence_failed'
          : 'machine_evidence_unknown',
      id: `${delivery.domain}:machine-evidence`,
      summary: machine.summary,
      tier: 'state',
    });
  }
  return blockers;
}

function bucketFor(
  delivery: CertificationInboxDelivery,
  machineBlockers: readonly CertificationBlocker[]
): CertificationInboxBucket {
  const { admission } = delivery;
  // A stale founder lock whose new revision is review-ready is a
  // re-certification the founder can act on; it stays in `stale` only while
  // its new evidence is incomplete.
  if (admission.state === 'review_ready' && admission.decisionEvidenceDigest) {
    return machineBlockers.length === 0 ? 'needs_you' : 'blocked';
  }
  if (admission.staleFounderLock) return 'stale';
  if (
    admission.state === 'working' &&
    (admission.currentDecision?.decision === 'rejected' ||
      admission.currentDecision?.decision === 'changes_requested')
  ) {
    return 'returned';
  }
  if (admission.state === 'working') return 'blocked';
  return 'certified';
}

function actionsFor(
  bucket: CertificationInboxBucket
): readonly CertificationInboxAction[] {
  return bucket === 'needs_you' ? CERTIFICATION_INBOX_ACTIONS : [];
}

const REVENUE_PATH_PATTERN =
  /\b(home|homepage|landing|claim|signup|sign-up|onboarding|start|pricing|checkout|billing|pay|paid|subscription|activation|profile)\b/i;

const DOMAIN_TIERS: Readonly<Record<string, CertificationInboxRevenueTier>> = {
  // The public artist profile is the canonical object the $199 offer sells.
  public_profiles: 'revenue_path_certification',
  smart_links: 'high_impact_surface',
  customers: 'high_impact_surface',
  lyb: 'other',
};

const TIER_UNBLOCKS: Record<CertificationInboxRevenueTier, string> = {
  first_dollar_blocker:
    'First dollar: this is the remaining founder blocker on the $199 path.',
  revenue_path_regression:
    'Keeps the live stranger → claim/signup → $199 → paid → activated path certified after a change.',
  revenue_path_certification:
    'Certifies a step on the stranger → claim/signup → $199 → paid → activated path.',
  high_impact_surface:
    'A high-traffic or high-impact surface outside the $199 path.',
  other: 'Not on the $199 revenue path.',
};

function revenueTierFor(
  delivery: CertificationInboxDelivery
): CertificationInboxRevenueTier {
  if (delivery.revenue) return delivery.revenue.tier;
  const { subject } = delivery.packet;
  const domainTier = DOMAIN_TIERS[delivery.domain];
  const onRevenuePath =
    domainTier === 'revenue_path_certification' ||
    (domainTier === undefined &&
      REVENUE_PATH_PATTERN.test(
        `${subject.id} ${subject.kind} ${subject.title}`
      ));
  if (onRevenuePath) {
    // A previously human-certified revenue surface whose evidence moved is a
    // live revenue-path change that needs judgment.
    return delivery.admission.baselineStatus ===
      'candidate_pending_recertification'
      ? 'revenue_path_regression'
      : 'revenue_path_certification';
  }
  return domainTier ?? 'high_impact_surface';
}

function passedEvidence(packet: CertificationReviewPacket): string[] {
  return [
    ...packet.canonicalReferences,
    ...packet.invariantEvaluation,
    ...packet.testsCoverage,
    ...packet.visualProof,
    ...operationalReceipts(packet),
  ]
    .filter(receipt => receipt.status === 'passed')
    .map(receipt => `${receipt.tier}: ${receipt.summary} (${receipt.ref})`);
}

function cardFor(
  delivery: CertificationInboxDelivery,
  tier: CertificationInboxRevenueTier
): CertificationInboxCard {
  const { admission, packet } = delivery;
  const { subject } = packet;
  const revision = packet.source
    ? `${packet.source.ref}@${packet.source.sha.slice(0, 12)}`
    : null;
  const digest = admission.decisionEvidenceDigest ?? 'the current evidence';
  const tierRank = CERTIFICATION_INBOX_REVENUE_TIERS.indexOf(tier) + 1;
  return {
    consequences: {
      accept: `Records one human approval receipt bound to ${digest}${revision ? ` at ${revision}` : ''}. It completes only this required evidence; lifecycle advances from the receipt, not from Ovie.`,
      comment:
        'Records a changes-requested receipt with your note as the remediation brief. The item returns to rework and comes back only after machine evidence reruns green.',
      reject:
        'Records a rejection receipt with your reason. The item returns to rework; any new revision must pass machine evidence again before it can return here.',
    },
    decision:
      delivery.requestedDecision ??
      `Certify ${subject.title} as canonical at ${revision ?? 'its current revision'}.`,
    greenEvidence: passedEvidence(packet),
    journey: `${subject.title} (${subject.kind}, ${delivery.domain})`,
    revision,
    unblocks: delivery.revenue?.unblocks ?? TIER_UNBLOCKS[tier],
    whyNow: `Revenue tier ${tierRank} (${tier.replaceAll('_', ' ')}): required machine evidence is green, so your judgment is the only missing requirement.${admission.staleFounderLock ? ' The evidence changed since your last approval, so that approval no longer covers this revision.' : ''}`,
  };
}

function toItem(
  delivery: CertificationInboxDelivery,
  bucket: CertificationInboxBucket,
  machineBlockers: readonly CertificationBlocker[] = []
): CertificationInboxItem {
  const { admission, packet } = delivery;
  const revenueTier = revenueTierFor(delivery);
  return {
    actions: actionsFor(bucket),
    blockers: [...admission.blockers, ...machineBlockers],
    bucket,
    card: bucket === 'needs_you' ? cardFor(delivery, revenueTier) : null,
    heldForMachineEvidence: machineBlockers.length > 0,
    revenueTier,
    revenueTierRank: CERTIFICATION_INBOX_REVENUE_TIERS.indexOf(revenueTier) + 1,
    contract: CERTIFICATION_INBOX_CONTRACT,
    decisionEvidenceDigest: admission.decisionEvidenceDigest,
    decisionScore: certificationDecisionScore(delivery.ranking),
    domain: delivery.domain,
    estimatedFounderMinutes: estimatedFounderMinutes(delivery.ranking),
    lastDecision: admission.currentDecision?.decision ?? null,
    observedAt: delivery.observedAt,
    requestedDecision: delivery.requestedDecision ?? null,
    staleFounderLock: admission.staleFounderLock !== null,
    state: admission.state,
    subject: packet.subject,
  };
}

function dedupeKey(delivery: CertificationInboxDelivery): string {
  return `${delivery.domain}:${delivery.packet.subject.id}`;
}

/**
 * Newer `observedAt` wins; ties fall back to the evidence digest so the
 * winner is deterministic and a stale card can never stand in for a newer
 * revision.
 */
function newestDelivery(
  current: CertificationInboxDelivery,
  candidate: CertificationInboxDelivery
): CertificationInboxDelivery {
  if (candidate.observedAt !== current.observedAt) {
    return candidate.observedAt > current.observedAt ? candidate : current;
  }
  const candidateDigest = candidate.admission.decisionEvidenceDigest ?? '';
  const currentDigest = current.admission.decisionEvidenceDigest ?? '';
  return candidateDigest >= currentDigest ? candidate : current;
}

/** Revenue tier first (never FIFO), then expected decision value, then cost. */
function byRank(left: CertificationInboxItem, right: CertificationInboxItem) {
  if (left.revenueTierRank !== right.revenueTierRank) {
    return left.revenueTierRank - right.revenueTierRank;
  }
  if (left.decisionScore !== right.decisionScore) {
    return right.decisionScore - left.decisionScore;
  }
  if (left.estimatedFounderMinutes !== right.estimatedFounderMinutes) {
    return left.estimatedFounderMinutes - right.estimatedFounderMinutes;
  }
  const leftKey = `${left.domain}:${left.subject.id}`;
  const rightKey = `${right.domain}:${right.subject.id}`;
  return leftKey.localeCompare(rightKey);
}

function byObservedAtDesc(
  left: CertificationInboxItem,
  right: CertificationInboxItem
) {
  return right.observedAt.localeCompare(left.observedAt);
}

export function projectCertificationInbox(
  deliveries: readonly CertificationInboxDelivery[]
): CertificationInboxQueue {
  const latest = new Map<string, CertificationInboxDelivery>();
  const superseded: CertificationInboxItem[] = [];

  for (const delivery of deliveries) {
    const key = dedupeKey(delivery);
    const current = latest.get(key);
    if (!current) {
      latest.set(key, delivery);
      continue;
    }
    const winner = newestDelivery(current, delivery);
    const loser = winner === current ? delivery : current;
    superseded.push(toItem(loser, 'superseded'));
    latest.set(key, winner);
  }

  const needsYou: CertificationInboxItem[] = [];
  const blocked: CertificationInboxItem[] = [];
  const stale: CertificationInboxItem[] = [];
  const returned: CertificationInboxItem[] = [];
  const certified: CertificationInboxItem[] = [];

  for (const delivery of latest.values()) {
    const machineBlockers = machineEvidenceBlockers(delivery);
    const bucket = bucketFor(delivery, machineBlockers);
    const item = toItem(delivery, bucket, machineBlockers);
    switch (bucket) {
      case 'needs_you':
        needsYou.push(item);
        break;
      case 'blocked':
        blocked.push(item);
        break;
      case 'stale':
        stale.push(item);
        break;
      case 'returned':
        returned.push(item);
        break;
      default:
        certified.push(item);
    }
  }

  needsYou.sort(byRank);
  for (const bucket of [blocked, stale, returned, certified, superseded]) {
    bucket.sort(byObservedAtDesc);
  }

  return {
    blocked,
    certified,
    contract: CERTIFICATION_INBOX_CONTRACT,
    needsYou,
    returned,
    stale,
    superseded,
  };
}
