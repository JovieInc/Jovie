import type { DogfoodProduct } from '@/lib/agent-os/dogfood-receipt';

export const QUALITY_SCOREBOARD_CONTRACT =
  'jovie.summer-quality-scoreboard/v1' as const;
export const QUALITY_OUTCOME_RECEIPT_SCHEMA =
  'jovie.quality-outcome-receipt/v1' as const;

export const QUALITY_OUTCOME_RECEIPT_KINDS = [
  'autonomous_resolution',
  'engineering_activity',
  'exposure',
  'founder_rescue',
  'learning_event',
  'quality_escape',
  'verified_improvement',
] as const;

export type QualityOutcomeReceiptKind =
  (typeof QUALITY_OUTCOME_RECEIPT_KINDS)[number];

export type QualityReceiptAuthority =
  | 'certification'
  | 'engineering_system'
  | 'founder'
  | 'learning_compiler'
  | 'product_analytics'
  | 'release_controller'
  | 'runtime'
  | 'user';

export interface QualityEvidenceLink {
  readonly ref: string;
  readonly observedAt: string;
}

interface QualityReceiptBase {
  readonly schema: typeof QUALITY_OUTCOME_RECEIPT_SCHEMA;
  readonly id: string;
  readonly kind: QualityOutcomeReceiptKind;
  readonly product: DogfoodProduct;
  readonly affectedSurface: string;
  readonly occurredAt: string;
  readonly authority: {
    readonly producer: QualityReceiptAuthority;
    readonly receipt: QualityEvidenceLink;
  };
}

export interface QualityMeasurement {
  readonly value: number;
  readonly unit: string;
  readonly evidence: QualityEvidenceLink;
}

export interface QualityDeploymentEvidence {
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly deployed: QualityEvidenceLink;
  readonly retest: QualityEvidenceLink;
}

export interface FailureTimeline {
  readonly failure: QualityEvidenceLink;
  readonly autonomousDetection: QualityEvidenceLink | null;
  readonly externalDiscovery: QualityEvidenceLink | null;
  readonly classification: QualityEvidenceLink;
  readonly remediation: QualityEvidenceLink | null;
}

export interface VerifiedImprovementReceipt extends QualityReceiptBase {
  readonly kind: 'verified_improvement';
  readonly customerOutcome: string;
  readonly desiredDirection: 'decrease' | 'increase';
  readonly before: QualityMeasurement;
  readonly after: QualityMeasurement;
  readonly deployment: QualityDeploymentEvidence;
}

export interface QualityEscapeReceipt extends QualityReceiptBase {
  readonly kind: 'quality_escape';
  readonly failureClass: string;
  readonly consequential: boolean;
  readonly discoveredBy: 'founder' | 'runtime' | 'user';
  readonly certificationEvidence: QualityEvidenceLink;
  readonly missedDetector: string;
  readonly timeline: FailureTimeline;
}

export interface AutonomousResolutionReceipt extends QualityReceiptBase {
  readonly kind: 'autonomous_resolution';
  readonly failureClass: string;
  readonly consequential: boolean;
  readonly founderIntervention: false;
  readonly detector: string;
  readonly timeline: FailureTimeline & {
    readonly autonomousDetection: QualityEvidenceLink;
    readonly remediation: QualityEvidenceLink;
  };
  readonly deployment: QualityDeploymentEvidence;
}

export interface FounderRescueReceipt extends QualityReceiptBase {
  readonly kind: 'founder_rescue';
  readonly failureClass: string;
  readonly rescueKind:
    | 'defect_discovery'
    | 'repeat_explanation'
    | 'stalled_repair';
  readonly linkedFailureReceiptId: string;
  readonly evidence: QualityEvidenceLink;
}

export interface LearningEventReceipt extends QualityReceiptBase {
  readonly kind: 'learning_event';
  readonly failureClass: string;
  readonly artifact: {
    readonly kind: 'executable' | 'none' | 'prose';
    readonly ref: string | null;
  };
  readonly evidence: QualityEvidenceLink;
  readonly guardrail: {
    readonly evaluations: number;
    readonly falsePositives: number;
    readonly unnecessaryBlocks: number;
    readonly evidence: QualityEvidenceLink;
  };
  readonly siblingPreventions: readonly {
    readonly surface: string;
    readonly evidence: QualityEvidenceLink;
  }[];
}

export interface QualityExposureReceipt extends QualityReceiptBase {
  readonly kind: 'exposure';
  readonly releases: number;
  readonly usageEvents: number;
  readonly evidence: QualityEvidenceLink;
}

export interface EngineeringActivityReceipt extends QualityReceiptBase {
  readonly kind: 'engineering_activity';
  readonly pullRequests: number;
  readonly issues: number;
  readonly ciRuns: number;
  readonly merges: number;
  readonly evidence: QualityEvidenceLink;
}

export type QualityOutcomeReceipt =
  | AutonomousResolutionReceipt
  | EngineeringActivityReceipt
  | FounderRescueReceipt
  | LearningEventReceipt
  | QualityEscapeReceipt
  | QualityExposureReceipt
  | VerifiedImprovementReceipt;

export interface ScoreboardMetric {
  readonly value: number | null;
  readonly sampleSize: number;
}

export interface QualityFailureTiming {
  readonly failureToAutonomousDetectionMinutes: number | null;
  readonly autonomousDetectionToClassificationMinutes: number | null;
  readonly classificationToRemediationMinutes: number | null;
  readonly failureToRemediationMinutes: number | null;
}

export interface QualityScoreboardProjection {
  readonly contract: typeof QUALITY_SCOREBOARD_CONTRACT;
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly source: {
    readonly status: 'connected' | 'disconnected';
    readonly receiptCount: number;
  };
  readonly productOutcomes: {
    readonly headline: {
      readonly verifiedImprovements: ScoreboardMetric;
      readonly qualityEscapes: ScoreboardMetric;
      readonly autonomousResolutions: ScoreboardMetric;
      readonly founderRescues: ScoreboardMetric;
    };
    readonly views: {
      readonly verifiedImprovements: readonly VerifiedImprovementReceipt[];
      readonly qualityEscapes: readonly (QualityEscapeReceipt & {
        readonly repeatOfLearnedClass: boolean;
        readonly timing: QualityFailureTiming;
      })[];
      readonly autonomousResolutions: readonly (AutonomousResolutionReceipt & {
        readonly timing: QualityFailureTiming;
      })[];
      readonly founderRescues: readonly (FounderRescueReceipt & {
        readonly repeatOfLearnedClass: boolean;
      })[];
    };
    readonly normalizedRates: {
      readonly releases: number | null;
      readonly usageEvents: number | null;
      readonly qualityEscapesPer100Releases: ScoreboardMetric;
      readonly qualityEscapesPer1000UsageEvents: ScoreboardMetric;
      readonly founderRescuesPer100Releases: ScoreboardMetric;
      readonly founderRescuesPer1000UsageEvents: ScoreboardMetric;
      readonly evidence: readonly QualityEvidenceLink[];
    };
  };
  readonly learning: {
    readonly repeatEscapeRateByFailureClass: readonly {
      readonly failureClass: string;
      readonly learnedAt: string;
      readonly escapes: number;
      readonly repeatEscapes: number;
      readonly rate: ScoreboardMetric;
    }[];
    readonly consequentialFailuresDetectedAutonomously: ScoreboardMetric;
    readonly timing: {
      readonly failureToAutonomousDetectionMinutes: ScoreboardMetric;
      readonly autonomousDetectionToClassificationMinutes: ScoreboardMetric;
      readonly classificationToRemediationMinutes: ScoreboardMetric;
      readonly failureToRemediationMinutes: ScoreboardMetric;
    };
    readonly executableArtifactRate: ScoreboardMetric;
    readonly guardrailBurden: {
      readonly evaluations: number | null;
      readonly falsePositiveRate: ScoreboardMetric;
      readonly unnecessaryBlockRate: ScoreboardMetric;
    };
    readonly siblingSurfacePreventions: readonly {
      readonly failureClass: string;
      readonly surface: string;
      readonly evidence: QualityEvidenceLink;
    }[];
  };
  readonly engineeringActivity: {
    readonly role: 'diagnostic_only';
    readonly pullRequests: ScoreboardMetric;
    readonly issues: ScoreboardMetric;
    readonly ciRuns: ScoreboardMetric;
    readonly merges: ScoreboardMetric;
    readonly evidence: readonly QualityEvidenceLink[];
  };
}

const SHA = /^[a-f0-9]{40}$/u;
const AUTHORITIES = new Set<QualityReceiptAuthority>([
  'certification',
  'engineering_system',
  'founder',
  'learning_compiler',
  'product_analytics',
  'release_controller',
  'runtime',
  'user',
]);
const PRODUCTS = new Set<DogfoodProduct>(['jov', 'lyb', 'ovie']);
const ALLOWED_AUTHORITIES: Record<
  QualityOutcomeReceiptKind,
  QualityReceiptAuthority[]
> = {
  autonomous_resolution: ['runtime'],
  engineering_activity: ['engineering_system'],
  exposure: ['product_analytics', 'release_controller'],
  founder_rescue: ['founder'],
  learning_event: ['learning_compiler'],
  quality_escape: ['certification', 'founder', 'runtime', 'user'],
  verified_improvement: ['certification', 'runtime'],
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function nonnegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function evidence(value: unknown): value is QualityEvidenceLink {
  return record(value) && text(value.ref) && timestamp(value.observedAt);
}

function measurement(value: unknown): value is QualityMeasurement {
  return (
    record(value) &&
    Number.isFinite(value.value) &&
    text(value.unit) &&
    evidence(value.evidence)
  );
}

function deployment(value: unknown): value is QualityDeploymentEvidence {
  return (
    record(value) &&
    typeof value.commitSha === 'string' &&
    SHA.test(value.commitSha) &&
    text(value.deploymentId) &&
    evidence(value.deployed) &&
    evidence(value.retest)
  );
}

function timeline(value: unknown): value is FailureTimeline {
  if (
    !record(value) ||
    !evidence(value.failure) ||
    !(
      value.autonomousDetection === null || evidence(value.autonomousDetection)
    ) ||
    !(value.externalDiscovery === null || evidence(value.externalDiscovery)) ||
    !evidence(value.classification) ||
    !(value.remediation === null || evidence(value.remediation))
  ) {
    return false;
  }
  const failure = Date.parse(value.failure.observedAt);
  const detection = value.autonomousDetection ?? value.externalDiscovery;
  const detectionAt = detection ? Date.parse(detection.observedAt) : failure;
  const classification = Date.parse(value.classification.observedAt);
  const remediation = value.remediation
    ? Date.parse(value.remediation.observedAt)
    : classification;
  return (
    failure <= detectionAt &&
    detectionAt <= classification &&
    classification <= remediation
  );
}

function validBase(value: Record<string, unknown>): boolean {
  if (
    value.schema !== QUALITY_OUTCOME_RECEIPT_SCHEMA ||
    !text(value.id) ||
    !QUALITY_OUTCOME_RECEIPT_KINDS.includes(
      value.kind as QualityOutcomeReceiptKind
    ) ||
    !PRODUCTS.has(value.product as DogfoodProduct) ||
    !text(value.affectedSurface) ||
    !timestamp(value.occurredAt) ||
    !record(value.authority) ||
    !AUTHORITIES.has(value.authority.producer as QualityReceiptAuthority) ||
    !evidence(value.authority.receipt)
  ) {
    return false;
  }
  return ALLOWED_AUTHORITIES[value.kind as QualityOutcomeReceiptKind].includes(
    value.authority.producer as QualityReceiptAuthority
  );
}

/** Runtime guard used at the durable ledger boundary. */
export function isQualityOutcomeReceipt(
  value: unknown
): value is QualityOutcomeReceipt {
  if (!record(value) || !validBase(value)) return false;
  switch (value.kind) {
    case 'verified_improvement':
      return (
        text(value.customerOutcome) &&
        ['decrease', 'increase'].includes(String(value.desiredDirection)) &&
        measurement(value.before) &&
        measurement(value.after) &&
        value.before.unit === value.after.unit &&
        (value.desiredDirection === 'increase'
          ? value.after.value > value.before.value
          : value.after.value < value.before.value) &&
        deployment(value.deployment)
      );
    case 'quality_escape':
      return (
        text(value.failureClass) &&
        typeof value.consequential === 'boolean' &&
        ['founder', 'runtime', 'user'].includes(String(value.discoveredBy)) &&
        evidence(value.certificationEvidence) &&
        text(value.missedDetector) &&
        timeline(value.timeline) &&
        record(value.timeline) &&
        (value.discoveredBy === 'runtime'
          ? evidence(value.timeline.autonomousDetection)
          : evidence(value.timeline.externalDiscovery))
      );
    case 'autonomous_resolution':
      return (
        text(value.failureClass) &&
        typeof value.consequential === 'boolean' &&
        value.founderIntervention === false &&
        text(value.detector) &&
        timeline(value.timeline) &&
        record(value.timeline) &&
        evidence(value.timeline.autonomousDetection) &&
        value.timeline.externalDiscovery === null &&
        evidence(value.timeline.remediation) &&
        deployment(value.deployment)
      );
    case 'founder_rescue':
      return (
        text(value.failureClass) &&
        ['defect_discovery', 'repeat_explanation', 'stalled_repair'].includes(
          String(value.rescueKind)
        ) &&
        text(value.linkedFailureReceiptId) &&
        evidence(value.evidence)
      );
    case 'learning_event':
      return (
        text(value.failureClass) &&
        record(value.artifact) &&
        ['executable', 'none', 'prose'].includes(String(value.artifact.kind)) &&
        (value.artifact.kind === 'none'
          ? value.artifact.ref === null
          : text(value.artifact.ref)) &&
        evidence(value.evidence) &&
        record(value.guardrail) &&
        nonnegativeInteger(value.guardrail.evaluations) &&
        nonnegativeInteger(value.guardrail.falsePositives) &&
        nonnegativeInteger(value.guardrail.unnecessaryBlocks) &&
        value.guardrail.falsePositives <= value.guardrail.evaluations &&
        value.guardrail.unnecessaryBlocks <= value.guardrail.evaluations &&
        evidence(value.guardrail.evidence) &&
        Array.isArray(value.siblingPreventions) &&
        value.siblingPreventions.every(
          item => record(item) && text(item.surface) && evidence(item.evidence)
        )
      );
    case 'exposure':
      return (
        nonnegativeInteger(value.releases) &&
        nonnegativeInteger(value.usageEvents) &&
        evidence(value.evidence)
      );
    case 'engineering_activity':
      return (
        nonnegativeInteger(value.pullRequests) &&
        nonnegativeInteger(value.issues) &&
        nonnegativeInteger(value.ciRuns) &&
        nonnegativeInteger(value.merges) &&
        evidence(value.evidence)
      );
    default:
      return false;
  }
}

function metric(value: number | null, sampleSize: number): ScoreboardMetric {
  return { value, sampleSize };
}

function rate(numerator: number, denominator: number, scale = 100) {
  return metric(
    denominator === 0
      ? null
      : Math.round(((numerator / denominator) * scale + Number.EPSILON) * 10) /
          10,
    denominator
  );
}

function minutes(start: QualityEvidenceLink, end: QualityEvidenceLink | null) {
  return end
    ? Math.max(
        0,
        (Date.parse(end.observedAt) - Date.parse(start.observedAt)) / 60_000
      )
    : null;
}

function failureTiming(value: FailureTimeline): QualityFailureTiming {
  return {
    failureToAutonomousDetectionMinutes: minutes(
      value.failure,
      value.autonomousDetection
    ),
    autonomousDetectionToClassificationMinutes: value.autonomousDetection
      ? minutes(value.autonomousDetection, value.classification)
      : null,
    classificationToRemediationMinutes: minutes(
      value.classification,
      value.remediation
    ),
    failureToRemediationMinutes: minutes(value.failure, value.remediation),
  };
}

function median(values: readonly (number | null)[]): ScoreboardMetric {
  const measured = values
    .filter((value): value is number => value !== null)
    .toSorted((left, right) => left - right);
  if (measured.length === 0) return metric(null, 0);
  const middle = Math.floor(measured.length / 2);
  const value =
    measured.length % 2 === 0
      ? ((measured[middle - 1] ?? 0) + (measured[middle] ?? 0)) / 2
      : (measured[middle] ?? 0);
  return metric(value, measured.length);
}

function disconnectedMetric(): ScoreboardMetric {
  return metric(null, 0);
}

/** Pure Ovie/Summer projection over immutable quality outcome receipts. */
export function projectQualityScoreboard(input: {
  readonly receipts: readonly QualityOutcomeReceipt[] | null;
  readonly generatedAt: string;
  readonly windowStart: string;
}): QualityScoreboardProjection {
  const connected = input.receipts !== null;
  const receipts = input.receipts ?? [];
  if (
    !timestamp(input.generatedAt) ||
    !timestamp(input.windowStart) ||
    Date.parse(input.windowStart) > Date.parse(input.generatedAt)
  ) {
    throw new Error('Quality scoreboard window is invalid.');
  }
  if (!receipts.every(isQualityOutcomeReceipt)) {
    throw new Error('Quality scoreboard received a malformed receipt.');
  }
  if (new Set(receipts.map(receipt => receipt.id)).size !== receipts.length) {
    throw new Error('Quality scoreboard receipt ids must be unique.');
  }
  const receiptById = new Map(receipts.map(receipt => [receipt.id, receipt]));
  for (const rescue of receipts.filter(
    (receipt): receipt is FounderRescueReceipt =>
      receipt.kind === 'founder_rescue'
  )) {
    const failure = receiptById.get(rescue.linkedFailureReceiptId);
    if (
      !failure ||
      !['autonomous_resolution', 'quality_escape'].includes(failure.kind) ||
      !('failureClass' in failure) ||
      failure.failureClass !== rescue.failureClass ||
      failure.affectedSurface !== rescue.affectedSurface
    ) {
      throw new Error(
        `Founder rescue ${rescue.id} must bind its exact failure receipt.`
      );
    }
  }

  const inWindow = receipts.filter(
    receipt =>
      Date.parse(receipt.occurredAt) >= Date.parse(input.windowStart) &&
      Date.parse(receipt.occurredAt) <= Date.parse(input.generatedAt)
  );
  const newestFirst = <T extends QualityOutcomeReceipt>(values: readonly T[]) =>
    values.toSorted((left, right) =>
      right.occurredAt.localeCompare(left.occurredAt)
    );
  const learning = receipts.filter(
    (receipt): receipt is LearningEventReceipt =>
      receipt.kind === 'learning_event' &&
      Date.parse(receipt.occurredAt) <= Date.parse(input.generatedAt)
  );
  const learnedAt = new Map<string, string>();
  for (const event of learning.toSorted((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt)
  )) {
    if (!learnedAt.has(event.failureClass)) {
      learnedAt.set(event.failureClass, event.occurredAt);
    }
  }
  const isRepeat = (failureClass: string, occurredAt: string) => {
    const learned = learnedAt.get(failureClass);
    return learned !== undefined && learned < occurredAt;
  };

  const improvements = newestFirst(
    inWindow.filter(
      (receipt): receipt is VerifiedImprovementReceipt =>
        receipt.kind === 'verified_improvement'
    )
  );
  const escapeReceipts = newestFirst(
    inWindow.filter(
      (receipt): receipt is QualityEscapeReceipt =>
        receipt.kind === 'quality_escape'
    )
  );
  const resolutionReceipts = newestFirst(
    inWindow.filter(
      (receipt): receipt is AutonomousResolutionReceipt =>
        receipt.kind === 'autonomous_resolution'
    )
  );
  const rescueReceipts = newestFirst(
    inWindow.filter(
      (receipt): receipt is FounderRescueReceipt =>
        receipt.kind === 'founder_rescue'
    )
  );
  const escapes = escapeReceipts.map(receipt => ({
    ...receipt,
    repeatOfLearnedClass: isRepeat(receipt.failureClass, receipt.occurredAt),
    timing: failureTiming(receipt.timeline),
  }));
  const resolutions = resolutionReceipts.map(receipt => ({
    ...receipt,
    timing: failureTiming(receipt.timeline),
  }));
  const rescues = rescueReceipts.map(receipt => ({
    ...receipt,
    repeatOfLearnedClass: isRepeat(receipt.failureClass, receipt.occurredAt),
  }));

  const exposure = inWindow.filter(
    (receipt): receipt is QualityExposureReceipt => receipt.kind === 'exposure'
  );
  const releases = exposure.reduce((sum, receipt) => sum + receipt.releases, 0);
  const usageEvents = exposure.reduce(
    (sum, receipt) => sum + receipt.usageEvents,
    0
  );
  const denominator = connected && exposure.length > 0;
  const normalized = (count: number, total: number, scale: number) =>
    denominator ? rate(count, total, scale) : disconnectedMetric();

  const learnedClasses = [...learnedAt.entries()]
    .map(([failureClass, firstLearnedAt]) => {
      const classEscapes = escapeReceipts.filter(
        receipt => receipt.failureClass === failureClass
      );
      const repeats = classEscapes.filter(receipt =>
        isRepeat(receipt.failureClass, receipt.occurredAt)
      );
      return {
        failureClass,
        learnedAt: firstLearnedAt,
        escapes: classEscapes.length,
        repeatEscapes: repeats.length,
        rate: rate(repeats.length, classEscapes.length),
      };
    })
    .sort((left, right) => left.failureClass.localeCompare(right.failureClass));

  const consequential = [...escapeReceipts, ...resolutionReceipts].filter(
    receipt => receipt.consequential
  );
  const autonomouslyDetected = consequential.filter(receipt => {
    const detection = receipt.timeline.autonomousDetection;
    const discovery = receipt.timeline.externalDiscovery;
    return (
      detection !== null &&
      (discovery === null ||
        Date.parse(detection.observedAt) <= Date.parse(discovery.observedAt))
    );
  });
  const timings = [...escapes, ...resolutions].map(receipt => receipt.timing);
  const windowLearning = inWindow.filter(
    (receipt): receipt is LearningEventReceipt =>
      receipt.kind === 'learning_event'
  );
  const evaluations = windowLearning.reduce(
    (sum, receipt) => sum + receipt.guardrail.evaluations,
    0
  );
  const falsePositives = windowLearning.reduce(
    (sum, receipt) => sum + receipt.guardrail.falsePositives,
    0
  );
  const unnecessaryBlocks = windowLearning.reduce(
    (sum, receipt) => sum + receipt.guardrail.unnecessaryBlocks,
    0
  );
  const activity = inWindow.filter(
    (receipt): receipt is EngineeringActivityReceipt =>
      receipt.kind === 'engineering_activity'
  );
  const activityMetric = (
    field: keyof Pick<
      EngineeringActivityReceipt,
      'ciRuns' | 'issues' | 'merges' | 'pullRequests'
    >
  ) =>
    connected && activity.length > 0
      ? metric(
          activity.reduce((sum, receipt) => sum + receipt[field], 0),
          activity.length
        )
      : disconnectedMetric();
  const outcomeMetric = (count: number) =>
    connected ? metric(count, inWindow.length) : disconnectedMetric();

  return {
    contract: QUALITY_SCOREBOARD_CONTRACT,
    generatedAt: input.generatedAt,
    windowStart: input.windowStart,
    source: {
      status: connected ? 'connected' : 'disconnected',
      receiptCount: receipts.length,
    },
    productOutcomes: {
      headline: {
        verifiedImprovements: outcomeMetric(improvements.length),
        qualityEscapes: outcomeMetric(escapes.length),
        autonomousResolutions: outcomeMetric(resolutions.length),
        founderRescues: outcomeMetric(rescues.length),
      },
      views: {
        verifiedImprovements: improvements,
        qualityEscapes: escapes,
        autonomousResolutions: resolutions,
        founderRescues: rescues,
      },
      normalizedRates: {
        releases: denominator ? releases : null,
        usageEvents: denominator ? usageEvents : null,
        qualityEscapesPer100Releases: normalized(escapes.length, releases, 100),
        qualityEscapesPer1000UsageEvents: normalized(
          escapes.length,
          usageEvents,
          1000
        ),
        founderRescuesPer100Releases: normalized(rescues.length, releases, 100),
        founderRescuesPer1000UsageEvents: normalized(
          rescues.length,
          usageEvents,
          1000
        ),
        evidence: exposure.map(receipt => receipt.evidence),
      },
    },
    learning: {
      repeatEscapeRateByFailureClass: learnedClasses,
      consequentialFailuresDetectedAutonomously: connected
        ? rate(autonomouslyDetected.length, consequential.length)
        : disconnectedMetric(),
      timing: {
        failureToAutonomousDetectionMinutes: median(
          timings.map(value => value.failureToAutonomousDetectionMinutes)
        ),
        autonomousDetectionToClassificationMinutes: median(
          timings.map(value => value.autonomousDetectionToClassificationMinutes)
        ),
        classificationToRemediationMinutes: median(
          timings.map(value => value.classificationToRemediationMinutes)
        ),
        failureToRemediationMinutes: median(
          timings.map(value => value.failureToRemediationMinutes)
        ),
      },
      executableArtifactRate: connected
        ? rate(
            windowLearning.filter(
              receipt => receipt.artifact.kind === 'executable'
            ).length,
            windowLearning.length
          )
        : disconnectedMetric(),
      guardrailBurden: {
        evaluations:
          connected && windowLearning.length > 0 ? evaluations : null,
        falsePositiveRate: connected
          ? rate(falsePositives, evaluations)
          : disconnectedMetric(),
        unnecessaryBlockRate: connected
          ? rate(unnecessaryBlocks, evaluations)
          : disconnectedMetric(),
      },
      siblingSurfacePreventions: windowLearning.flatMap(receipt =>
        receipt.siblingPreventions.map(prevention => ({
          failureClass: receipt.failureClass,
          surface: prevention.surface,
          evidence: prevention.evidence,
        }))
      ),
    },
    engineeringActivity: {
      role: 'diagnostic_only',
      pullRequests: activityMetric('pullRequests'),
      issues: activityMetric('issues'),
      ciRuns: activityMetric('ciRuns'),
      merges: activityMetric('merges'),
      evidence: activity.map(receipt => receipt.evidence),
    },
  };
}
