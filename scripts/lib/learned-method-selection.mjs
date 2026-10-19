/** Consume compiled methods at an existing routing boundary. The existing
 * evidence/artifact owner supplies current records, never the job or model.
 * No registry, promotion authority, executable import or context injection.
 */
import { explainRouteDecision } from '../../apps/eve-pilot/agent/lib/governor-route.ts';
import {
  compilationDigest,
  hasCompilationProof,
} from './lesson-compilation-proof.mjs';
import {
  learningReceiptKey,
  validateLearningReceipt,
} from './rolling-ci-learning.mjs';

export const LESSON_METHOD_SURFACE = 'scripts/lib/lesson-analysis.mjs';

function preferredRoute(incumbent, id) {
  const routes = [incumbent.selectedRoute, ...incumbent.alternatives];
  const costs = [incumbent.fullyLoadedCost, ...incumbent.alternativeCosts];
  const index = routes.findIndex(row => row.id === id);
  const cost = costs[index];
  const selected = {
    ...incumbent,
    selectedRoute: routes[index],
    alternatives: routes.filter((_, i) => i !== index),
    fullyLoadedCost: cost,
    alternativeCosts: costs.filter((_, i) => i !== index),
    expectedFullyLoadedCost: cost.expectedTotal.amount ?? cost.knownLowerBound,
    confidence: cost.uncertainty.confidence,
  };
  return { ...selected, explanation: explainRouteDecision(selected) };
}

async function evaluate(record, context, owner) {
  const receipt = record?.receipt;
  const compiled = receipt?.compilation;
  // Rehydrated JSON is not proof. Replay it in this process before use.
  if (
    !hasCompilationProof(receipt, context.now()) ||
    !validateLearningReceipt(receipt).ok ||
    compiled?.status !== 'compiled'
  )
    return { eligible: false, reason: 'unqualified-compilation' };

  const analysis = await owner.loadAnalysis(compiled.analysisRef, {
    signal: context.signal,
  });
  const artifact = await owner.currentArtifact(compiled.artifact.id, {
    signal: context.signal,
  });
  const method = compiled.artifact.method;
  const route = [
    context.incumbent.selectedRoute,
    ...context.incumbent.alternatives,
  ].find(row => row.id === method);
  const graph = analysis?.attemptGraph;
  const binding = graph?.binding;
  const successful =
    graph?.attempts?.filter(
      row =>
        row.method === method && row.outcome === 'succeeded' && row.verified
    ) ?? [];
  const causal = graph?.evidence?.find(row => {
    const proof = row.causalVerification;
    return (
      row.access === 'development' &&
      row.kind === 'causal-verification' &&
      proof?.causeKey === analysis.finding?.rootCause?.causeKey &&
      successful.some(attempt => attempt.id === proof.successfulAttemptId) &&
      graph.attempts.some(
        attempt =>
          attempt.id === proof.failedAttemptId &&
          attempt.outcome === 'failed' &&
          attempt.verified
      ) &&
      graph.evidence.some(evidence => evidence.ref === proof.evidenceRef) &&
      analysis.finding.rootCause.evidenceRefs.includes(row.ref) &&
      analysis.finding.differences.some(
        difference =>
          difference.failedAttemptId === proof.failedAttemptId &&
          difference.successfulAttemptId === proof.successfulAttemptId
      ) &&
      ![
        method,
        route?.tuple.model,
        route?.tuple.provider,
        ...analysis.resolutions.map(row => row.receipt.selectedRoute.id),
      ].includes(proof.verifierId)
    );
  });
  const predicates = {
    reviewed:
      analysis?.disposition === 'target' &&
      analysis.challenge?.verdict === 'agree' &&
      analysis.challenge.proposalDigest === compilationDigest(analysis.finding),
    evidence:
      Boolean(causal) &&
      graph.evidence.every(
        row =>
          row.access === 'development' &&
          row.revision === graph.work.revision &&
          ['tenantId', 'productId', 'cohortId'].every(
            key => row.binding?.[key] === binding?.[key]
          )
      ),
    job:
      compiled.applicability.workClass === context.workClass &&
      graph?.workClass === context.workClass &&
      compiled.applicability.surfaces.includes(LESSON_METHOD_SURFACE),
    tenant:
      typeof binding?.tenantId === 'string' &&
      binding.tenantId === context.binding.tenantId &&
      compiled.applicability.tenantId === context.binding.tenantId,
    product:
      binding?.productId === context.binding.productId &&
      compiled.applicability.productId === context.binding.productId,
    cohort:
      binding?.cohortId !== undefined &&
      binding.cohortId === context.binding.cohortId &&
      compiled.applicability.cohortId === context.binding.cohortId,
    revision:
      receipt.identity.head === context.revision &&
      compiled.sourceRevisions[0] === graph?.work.revision &&
      compiled.sourceRevisions.includes(context.revision) &&
      artifact?.revision === context.revision &&
      artifact.routesVersion === context.routesVersion,
    executable:
      ['routing-policy', 'skill-method'].includes(compiled.artifact.kind) &&
      Boolean(route) &&
      artifact?.method === method &&
      artifact.id === compiled.artifact.id &&
      artifact.path === compiled.artifact.path &&
      artifact.version === compiled.artifact.version &&
      typeof artifact.source === 'string' &&
      compilationDigest(artifact.source) === compiled.artifact.version &&
      artifact.tupleDigest === compilationDigest(route?.tuple),
    current:
      artifact?.status === 'active' &&
      Date.parse(compiled.revalidation.at) > context.now(),
    rollout:
      artifact?.selectionAllowed === true &&
      typeof artifact.releaseControlRef === 'string' &&
      artifact.releaseControlRef.length > 0,
    permissions:
      Array.isArray(artifact?.requiredActions) &&
      artifact.requiredActions.length > 0 &&
      artifact.requiredActions.every(
        action =>
          context.permittedActions.includes(action) &&
          !context.forbiddenActions.includes(action)
      ),
    independentChallenger: Boolean(route) && context.canChallenge(route),
  };
  return {
    eligible: Object.values(predicates).every(Boolean),
    reason: 'predicate-evaluation',
    predicates,
    artifact: { ...compiled.artifact },
    learningReceipt: learningReceiptKey(receipt.identity),
    analysisRef: compiled.analysisRef,
    receiptDigest: compilationDigest(receipt),
    artifactStateRef: artifact.releaseControlRef,
  };
}

/** Optional evidence-owner port. Missing or rejected learning keeps the
 * incumbent, and every call rereads current artifact state. lookup returns
 * at most 32 compiler-qualified receipts; persisted JSON is replayed here.
 * loadAnalysis authenticates the reviewed source. currentArtifact projects
 * lifecycle, source, tuple digest, actions, and rollout from existing owners.
 * Ship now: one author boundary and exact revision compatibility.
 * Re-evaluate when: replay proves another boundary or revision equivalent.
 * Then: that owner supplies and reviews the explicit compatibility.
 */
export async function selectLearnedMethod(context, owner) {
  const consumption = {
    incumbentAlternative: context.incumbent.selectedRoute.id,
    evaluatedContext: {
      binding: { ...context.binding },
      workClass: context.workClass,
      revision: context.revision,
      routesVersion: context.routesVersion,
      surface: LESSON_METHOD_SURFACE,
      permittedActions: [...context.permittedActions],
      forbiddenActions: [...context.forbiddenActions],
    },
    selectedArtifact: null,
    learningReceipt: null,
    analysisRef: null,
    receiptDigest: null,
    artifactStateRef: null,
    predicateEvaluation: null,
    evaluations: [],
    actualFirstAttemptedMethod: null,
    recheck: null,
  };
  if (!owner) return { route: context.incumbent, consumption };
  try {
    const records = await owner.lookup(
      {
        binding: context.binding,
        workClass: context.workClass,
        revision: context.revision,
        surface: LESSON_METHOD_SURFACE,
      },
      { signal: context.signal }
    );
    if (!Array.isArray(records) || records.length > 32)
      throw new Error('bounded-learning-required');
    const accepted = [];
    for (const record of records) {
      try {
        const result = await evaluate(record, context, owner);
        consumption.evaluations.push(result);
        if (result.eligible) accepted.push(result);
      } catch {
        consumption.evaluations.push({
          eligible: false,
          reason: 'learning-unavailable',
        });
      }
    }
    // Eligible conflicts keep the incumbent; retrieval order is not a vote.
    const methods = new Set(accepted.map(row => row.artifact.method));
    if (methods.size !== 1) return { route: context.incumbent, consumption };
    accepted.sort((a, b) => a.learningReceipt.localeCompare(b.learningReceipt));
    const selected = accepted[0];
    Object.assign(consumption, {
      selectedArtifact: selected.artifact,
      learningReceipt: selected.learningReceipt,
      analysisRef: selected.analysisRef,
      receiptDigest: selected.receiptDigest,
      artifactStateRef: selected.artifactStateRef,
      predicateEvaluation: selected.predicates,
    });
    return {
      route: preferredRoute(context.incumbent, selected.artifact.method),
      consumption,
    };
  } catch {
    consumption.evaluations.push({
      eligible: false,
      reason: 'learning-unavailable',
    });
    return { route: context.incumbent, consumption };
  }
}
