// JOV-5956 composes JOV-INV-027 with canonical certification evidence.
// Pure planner/projector: no queue, registry, certification state, or mutation.
import { createHash } from 'node:crypto';
export const QUALITY_SATURATION_PLAN_SCHEMA =
  'jovie-quality-saturation-plan/v1';
export const QUALITY_SATURATION_RECEIPT_SCHEMA =
  'jovie-quality-saturation-receipt/v1';
export const QUALITY_SATURATION_STAGES = Object.freeze(
  'verify-outcome search-counterexamples seek-independent-disagreement compare-alternatives expand-evidence-envelope ratchet-standard'.split(
    ' '
  )
);
const PRESSURE_FACTOR = Object.freeze({ normal: 1, fast: 0.5, emergency: 0 });
const CERTIFIED_STATES = new Set(
  'machine_certified certified shipped monitored'.split(' ')
);
const FORBIDDEN_METRIC = /token|review[-_ ]?count|prose|word[-_ ]?count/i;
const FIXED_CONSTRAINTS = 'safety privacy authority truthfulness';
const ROUTE_FIELDS =
  'id provider model harness contextDigest promptDigest method reviewer'.split(
    ' '
  );
function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value, Object.keys(value).sort()))
    .digest('hex')
    .slice(0, 20);
}
const finite = value => Number.isFinite(value) && value >= 0;
const minutesUntil = (from, until) =>
  (Date.parse(until) - Date.parse(from)) / 60_000;
function routeIdentity(route) {
  const { id: _routeId, ...independence } = route;
  return digest(independence);
}
function passIdentity(object, pass) {
  return `${object.type}:${object.id}@${object.revision}:${pass.hypothesisId}`;
}
function validateInput(input) {
  const base = input?.baseCertification;
  const risk = input?.riskProfile;
  if (
    !input?.object?.type ||
    !input.object.id ||
    !input.object.revision ||
    !base?.predicate ||
    !CERTIFIED_STATES.has(base.state) ||
    !Array.isArray(base.evidenceRefs) ||
    base.evidenceRefs.length === 0 ||
    !risk?.consequence ||
    !risk.risk ||
    !finite(risk.value) ||
    !risk.materialUncertainty ||
    risk.fixedConstraints !== FIXED_CONSTRAINTS
  ) {
    throw new Error('quality saturation requires current certified evidence');
  }
  const capacity = input.capacity;
  if (
    !Object.hasOwn(PRESSURE_FACTOR, capacity?.mode) ||
    !finite(capacity?.forecastSurplus) ||
    !Number.isInteger(capacity?.maxParallelism) ||
    capacity.maxParallelism < 1 ||
    !finite(capacity?.minimumMarginalValue) ||
    !Array.isArray(capacity?.compatibleRoutes)
  ) {
    throw new Error('quality saturation requires a bounded capacity forecast');
  }
}
function normalizePass(input, pass, receipts) {
  if (
    !pass?.id ||
    !pass.hypothesisId ||
    !pass.hypothesis ||
    !QUALITY_SATURATION_STAGES.includes(pass.stage) ||
    !pass.dimension ||
    ROUTE_FIELDS.some(field => !pass.route?.[field]) ||
    !finite(pass.expectedMarginalValue) ||
    !finite(pass.expectedInformationGain) ||
    !finite(pass.expectedDefectDiscoveryProbability) ||
    pass.expectedDefectDiscoveryProbability > 1 ||
    !finite(pass.cost) ||
    !finite(pass.latencyMinutes) ||
    !pass.stopCondition ||
    !pass.durableOutput ||
    !Number.isInteger(pass.maxAttempts) ||
    pass.maxAttempts < 1
  ) {
    throw new Error(
      `invalid quality saturation pass: ${pass?.id || 'unknown'}`
    );
  }
  if (FORBIDDEN_METRIC.test(pass.successMetric || '')) {
    throw new Error(`invalid quality success metric: ${pass.successMetric}`);
  }
  const identity = passIdentity(input.object, pass);
  const independence = routeIdentity(pass.route);
  const prior = receipts.filter(receipt => receipt.passIdentity === identity);
  const noInformation = prior.filter(
    receipt =>
      receipt.independence.identity === independence && receipt.noInformation
  );
  const rawMarginalValue =
    pass.expectedMarginalValue + pass.expectedInformationGain - pass.cost;
  const calibratedMarginalValue =
    rawMarginalValue * 0.5 ** noInformation.length;
  return {
    ...pass,
    passIdentity: identity,
    independence: { identity: independence, route: pass.route },
    attemptsRemaining: Math.max(0, pass.maxAttempts - prior.length),
    calibratedMarginalValue,
  };
}
export function buildQualitySaturationPlan(input) {
  validateInput(input);
  const receipts = input.receipts || [];
  const capacity = input.capacity;
  const timeRemaining = minutesUntil(capacity.now, capacity.expiresAt);
  const hurdle = capacity.minimumMarginalValue * PRESSURE_FACTOR[capacity.mode];
  const unique = new Map();
  for (const raw of input.passes || []) {
    const pass = normalizePass(input, raw, receipts);
    const key = pass.independence.identity;
    const current = unique.get(key);
    if (
      capacity.forecastSurplus > 0 &&
      capacity.compatibleRoutes.includes(pass.route.id) &&
      pass.attemptsRemaining > 0 &&
      (pass.latencyMinutes <= timeRemaining || pass.durablePartialValue) &&
      pass.calibratedMarginalValue > hurdle &&
      (!current ||
        pass.calibratedMarginalValue > current.calibratedMarginalValue)
    ) {
      unique.set(key, pass);
    }
  }
  const rankedPasses = [...unique.values()].sort(
    (left, right) =>
      right.calibratedMarginalValue - left.calibratedMarginalValue ||
      QUALITY_SATURATION_STAGES.indexOf(left.stage) -
        QUALITY_SATURATION_STAGES.indexOf(right.stage) ||
      left.id.localeCompare(right.id)
  );
  const recommendedPasses = rankedPasses.slice(0, capacity.maxParallelism);
  const recommendedStages = new Set(
    recommendedPasses.map(pass => pass.stage)
  );
  const qualityFrontier = [...QUALITY_SATURATION_STAGES]
    .reverse()
    .find(stage => recommendedStages.has(stage));
  return {
    schema: QUALITY_SATURATION_PLAN_SCHEMA,
    object: input.object,
    baseCertification: input.baseCertification,
    riskProfile: input.riskProfile,
    capacity,
    rankedPasses,
    recommendedPasses,
    qualityFrontier: qualityFrontier ?? receipts.at(-1)?.stage ?? 'certified',
    nextRecommendedChallenge: recommendedPasses[0] ?? null,
  };
}
export function selectMarginalWork(plan, breadthCandidates = []) {
  const quality = plan.rankedPasses[0] ?? null;
  const breadth = breadthCandidates
    .filter(
      candidate =>
        finite(candidate.expectedMarginalValue) &&
        candidate.compatibleRoutes?.some(route =>
          plan.capacity.compatibleRoutes.includes(route)
        )
    )
    .sort(
      (left, right) =>
        right.expectedMarginalValue - left.expectedMarginalValue ||
        left.id.localeCompare(right.id)
    )[0];
  const qualityWins =
    quality &&
    (!breadth ||
      quality.calibratedMarginalValue > breadth.expectedMarginalValue);
  const selected = qualityWins ? quality : (breadth ?? quality);
  return {
    kind: qualityWins ? 'quality-saturation' : breadth ? 'breadth' : 'none',
    selected,
    explanation: selected
      ? `${qualityWins ? 'quality' : 'breadth'} marginal value ${
          qualityWins
            ? quality.calibratedMarginalValue
            : breadth.expectedMarginalValue
        } beat ${qualityWins ? (breadth?.expectedMarginalValue ?? 'no compatible breadth') : (quality?.calibratedMarginalValue ?? 'no eligible quality pass')}`
      : 'no compatible positive-value work',
  };
}
export function recordQualitySaturationResult(plan, passId, result) {
  const pass = plan.rankedPasses.find(candidate => candidate.id === passId);
  if (!pass || !result?.completedAt || !result.durableOutput) {
    throw new Error(
      'quality result must bind an eligible pass and durable output'
    );
  }
  const attempt = pass.maxAttempts - pass.attemptsRemaining + 1;
  const defect = Boolean(result.defectSeverity);
  const noInformation =
    !defect && result.actualInformationGain === 0 && !result.outcomeImprovement;
  return {
    schema: QUALITY_SATURATION_RECEIPT_SCHEMA,
    id: `${pass.passIdentity}:${attempt}`,
    object: plan.object,
    baseEvidenceState: plan.baseCertification,
    baseCertificationPredicate: plan.baseCertification.predicate,
    passIdentity: pass.passIdentity,
    hypothesis: pass.hypothesis,
    qualityDimension: pass.dimension,
    stage: pass.stage,
    independence: pass.independence,
    expectedMarginalValue: pass.expectedMarginalValue,
    predictedDefectDiscovery: pass.expectedDefectDiscoveryProbability,
    actualDefectDiscovered: defect,
    predictedInformationGain: pass.expectedInformationGain,
    stopCondition: pass.stopCondition,
    findings: result.findings || [],
    defectSeverity: result.defectSeverity ?? null,
    correctedState: result.correctedState ?? null,
    newEvidence: result.newEvidence || [],
    confidenceChange: result.confidenceChange ?? 0,
    capacityConsumed: result.capacityConsumed,
    durableOutput: result.durableOutput,
    reusableArtifact: result.reusableArtifact ?? null,
    actualInformationGain: result.actualInformationGain,
    remediationAvoided: result.remediationAvoided ?? 0,
    remediationCreated: result.remediationCreated ?? 0,
    noInformation,
    futureValueMultiplier: noInformation ? 0.5 : 1,
    disposition: defect
      ? 'remediation-required'
      : 'base-certification-retained',
    recertificationRequired: defect,
    completedAt: result.completedAt,
  };
}
export function evaluateInvariantPromotion(proposal, receipts) {
  const evidence = receipts.filter(
    receipt =>
      receipt.reusableArtifact?.id === proposal?.checkId &&
      receipt.actualInformationGain > 0
  );
  const objects = new Set(
    evidence.map(receipt => `${receipt.object.type}:${receipt.object.id}`)
  );
  const routes = new Set(
    evidence.map(receipt => receipt.independence.identity)
  );
  const required = Boolean(
    proposal?.checkId &&
      Number.isInteger(proposal?.version) &&
      proposal.version > 0 &&
      proposal?.scope &&
      proposal?.authority?.owner &&
      proposal?.authority?.approvedBy &&
      proposal?.rollback
  );
  const reasons = [
    ...(!required ? ['proposal-contract-incomplete'] : []),
    ...(objects.size < 3
      ? ['representative-object-evidence-insufficient']
      : []),
    ...(routes.size < 2 ? ['independent-route-evidence-insufficient'] : []),
  ];
  return {
    eligible: reasons.length === 0,
    reasons,
    targetRegistry: 'canon/invariants.jsonl',
    version: proposal?.version ?? null,
    scope: proposal?.scope ?? null,
    authority: proposal?.authority ?? null,
    rollback: proposal?.rollback ?? null,
    evidenceReceipts: evidence.map(receipt => receipt.id).sort(),
  };
}
export function projectQualityFrontier(plan, receipts, founderJudgment = null) {
  const objectReceipts = receipts.filter(
    receipt =>
      receipt.object.id === plan.object.id &&
      receipt.object.revision === plan.object.revision
  );
  return {
    object: plan.object,
    currentQualityFrontier: plan.qualityFrontier,
    nextRecommendedChallenge: plan.nextRecommendedChallenge,
    evidenceGained: objectReceipts.reduce(
      (sum, receipt) => sum + receipt.actualInformationGain,
      0
    ),
    disagreement: objectReceipts
      .filter(receipt => receipt.findings.length > 0)
      .map(receipt => ({
        route: receipt.independence.route,
        findings: receipt.findings,
      })),
    founderJudgmentRequired: founderJudgment,
  };
}
