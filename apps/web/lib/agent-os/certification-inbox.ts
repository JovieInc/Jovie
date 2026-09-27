import {
  type CertificationAdmission,
  type CertificationBlocker,
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
}

export interface CertificationInboxQueue {
  readonly contract: typeof CERTIFICATION_INBOX_CONTRACT;
  /** Ranked founder-judgment queue: review-ready items only. */
  readonly needsYou: readonly CertificationInboxItem[];
  /** Working/blocked items with explicit blocker evidence. */
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

function bucketFor(
  delivery: CertificationInboxDelivery
): CertificationInboxBucket {
  const { admission } = delivery;
  if (admission.staleFounderLock) return 'stale';
  if (admission.state === 'review_ready' && admission.decisionEvidenceDigest) {
    return 'needs_you';
  }
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

function toItem(
  delivery: CertificationInboxDelivery,
  bucket: CertificationInboxBucket
): CertificationInboxItem {
  const { admission, packet } = delivery;
  return {
    actions: actionsFor(bucket),
    blockers: admission.blockers,
    bucket,
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

function byRank(left: CertificationInboxItem, right: CertificationInboxItem) {
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
    const bucket = bucketFor(delivery);
    const item = toItem(delivery, bucket);
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
