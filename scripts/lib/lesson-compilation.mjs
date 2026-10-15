/** JOV-8421: qualify existing artifacts; never execute learner-supplied code.
 * Ports are supplied by the existing analysis, evidence and promotion owners.
 * References and requested metadata are data, never evaluation/approval ports.
 */
import {
  analysisActors,
  CompilationError,
  check,
  paths,
  readReplaySource,
  replayLessonArtifact,
  SHA,
  text,
} from './lesson-artifact-replay.mjs';

export { lessonApplies, readReplaySource } from './lesson-artifact-replay.mjs';

import {
  compilationDigest,
  qualifyCompilation,
} from './lesson-compilation-proof.mjs';
import { upsertLinearIssueByTitleFingerprint } from './linear-issue-intake.mjs';
import { validateLearningReceipt } from './rolling-ci-learning.mjs';

const KINDS = [
  'validator',
  'regression-fixture',
  'routing-policy',
  'skill-method',
];
const same = (a, b) => compilationDigest(a) === compilationDigest(b);

function validateAnalysis(analysis) {
  check(
    analysis.schema === 'jovie.lesson-analysis/v1' &&
      ['target', 'no-change'].includes(analysis.disposition) &&
      analysis.challenge?.verdict === 'agree' &&
      analysis.challenge.proposalDigest === compilationDigest(analysis.finding),
    'independently-reviewed-analysis-required'
  );
  check(
    text(analysis.policies?.analysis) && text(analysis.policies?.independence),
    'analysis-policy-required'
  );
  const resolutions = analysis.resolutions;
  check(
    Array.isArray(resolutions) &&
      resolutions.length === 2 &&
      resolutions[0].role === 'author' &&
      resolutions[1].role === 'challenger',
    'independent-resolutions-required'
  );
  const author = resolutions[0].receipt.selectedRoute;
  const challenger = resolutions[1].receipt.selectedRoute;
  check(
    author.id !== challenger.id &&
      author.tuple.provider !== challenger.tuple.provider &&
      author.tuple.model !== challenger.tuple.model,
    'learner-self-review'
  );
  check(
    text(analysis.owner) && text(analysis.lessonClass),
    'analysis-owner-and-class-required'
  );
  paths(analysis.affectedScope);
  check(
    analysis.attemptGraph.evidence.every(row => row.access === 'development'),
    'unsafe-analysis-evidence'
  );
}

/** The loader must verify the persisted analysis receipt using child 5's
 * existing capability/review controls. Neither a manifest nor model output can
 * provide this port, the target inventory, replay adapter or authorization.
 * No scheduler, registry, model call or promotion authority is introduced.
 */
export async function compileLesson(requestInput, environment) {
  try {
    const request = structuredClone(requestInput);
    check(
      Object.keys(request).every(key =>
        [
          'analysisRef',
          'candidateRevision',
          'artifact',
          'applicability',
          'rollback',
          'revalidation',
          'expectedSaving',
          'replayRef',
          'learningReceipt',
          'outcome',
        ].includes(key)
      ),
      'unsupported-compilation-assertion'
    );
    check(
      text(request.analysisRef) && SHA.test(request.candidateRevision),
      'source-revisions-required'
    );
    check(
      ['compiled', 'no-new-invariant'].includes(request.outcome),
      'invalid-compilation-outcome'
    );
    check(!request.learningReceipt?.compilation, 'learner-proof-assertion');
    check(
      validateLearningReceipt(request.learningReceipt, {
        liveHead: request.candidateRevision,
      }).ok,
      'rolling-learning-proof-required'
    );
    const analysis = structuredClone(
      await environment.loadAnalysis(request.analysisRef)
    );
    validateAnalysis(analysis);
    paths(request.applicability?.surfaces);
    check(
      Object.keys(request.applicability).sort().join() ===
        'cohortId,productId,surfaces,tenantId,workClass' &&
        text(request.applicability.tenantId) &&
        (request.applicability.cohortId === null ||
          text(request.applicability.cohortId)) &&
        request.applicability.tenantId ===
          analysis.finding.applicability.tenantId &&
        request.applicability.cohortId ===
          analysis.finding.applicability.cohortId &&
        request.applicability.productId ===
          analysis.finding.applicability.productId &&
        request.applicability.workClass === analysis.finding.workClass &&
        request.applicability.surfaces.every(surface =>
          analysis.affectedScope.includes(surface)
        ),
      'overbroad-applicability'
    );
    const targets = environment.targets.filter(
      target =>
        KINDS.includes(target.kind) &&
        /\.(?:jsonl?|[cm]?[jt]sx?|py)$/u.test(target.path) &&
        typeof target.replay === 'function' &&
        text(target.replayVersion) &&
        (target.kind !== 'skill-method' ||
          (text(target.method) && /\.[cm]?[jt]s$|\.py$/u.test(target.path))) &&
        target.applies(analysis)
    );
    check(
      targets.every(
        target =>
          Number.isFinite(target.estimatedCostUsd) &&
          target.estimatedCostUsd >= 0
      ),
      'target-cost-required'
    );
    targets.sort(
      (a, b) =>
        a.estimatedCostUsd - b.estimatedCostUsd ||
        KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) ||
        a.id.localeCompare(b.id)
    );
    const target = targets[0];
    if (!target) {
      const fingerprint = `lesson-repair-${compilationDigest({
        workClass: analysis.finding.workClass,
        cause: analysis.finding.rootCause.causeKey ?? 'unresolved',
        scope: {
          ...request.applicability,
          surfaces: [...request.applicability.surfaces].sort(),
        },
      }).slice(0, 32)}`;
      const intake = await upsertLinearIssueByTitleFingerprint({
        ...environment.intake,
        fingerprint,
        labelKey: fingerprint,
        title: `Lesson repair ${fingerprint}`,
        description: `Owner: ${analysis.owner}\nReviewed analysis: ${request.analysisRef}\nSource: ${analysis.attemptGraph.work.revision}\nUnsupported executable repair; existing intake must assign implementation.`,
      });
      check(
        intake.ok && text(intake.identifier),
        'unsupported-repair-intake-failed'
      );
      return {
        disposition: 'owner-issue',
        issue: intake.identifier,
        fingerprint,
      };
    }
    check(
      target.id === request.artifact?.id &&
        text(target.owner) &&
        text(request.artifact.version) &&
        /^[a-f0-9]{64}$/u.test(request.artifact.version),
      'cheapest-versioned-target-required'
    );
    paths([target.path]);
    check(
      SHA.test(request.rollback?.revision) && text(request.rollback.reason),
      'rollback-required'
    );
    readReplaySource(
      environment.repoRoot,
      request.rollback.revision,
      target.path
    );
    check(
      Number.isFinite(request.expectedSaving?.amount) &&
        request.expectedSaving.amount >= 0 &&
        ['usd', 'minutes', 'failures'].includes(request.expectedSaving.unit) &&
        same(request.expectedSaving, analysis.expectedSaving) &&
        analysis.finding.expectedSavings.evidenceRefs.includes(
          request.expectedSaving.evidenceRef
        ),
      'evidenced-saving-required'
    );
    const expiresAt = Date.parse(request.revalidation?.at);
    check(
      expiresAt > Date.now() && text(request.revalidation.trigger),
      'expiry-or-revalidation-required'
    );
    check(
      request.outcome === 'compiled'
        ? analysis.disposition === 'target' &&
            request.learningReceipt.guardrailDecision.warranted
        : analysis.disposition === 'no-change' &&
            !request.learningReceipt.guardrailDecision.warranted,
      'compilation-disposition-mismatch'
    );
    check(
      analysis.finding.rootCause.status === 'supported',
      'unsupported-causal-claim'
    );
    check(
      request.learningReceipt.rootCauseClass ===
        analysis.finding.rootCause.causeKey,
      'rolling-cause-mismatch'
    );
    const replay = await replayLessonArtifact(
      request,
      analysis,
      target,
      environment
    );
    check(
      request.learningReceipt.deliberateRedRegression.fixture ===
        replay.replayRef &&
        same(
          [...request.learningReceipt.equivalentSurfaceSweep.surfaces].sort(),
          [...request.applicability.surfaces].sort()
        ),
      'rolling-proof-replay-mismatch'
    );
    const compilation = {
      status: request.outcome,
      analysisRef: request.analysisRef,
      sourceRevisions: [
        analysis.attemptGraph.work.revision,
        request.candidateRevision,
      ],
      artifact: {
        id: target.id,
        kind: target.kind,
        path: target.path,
        version: request.artifact.version,
        owner: target.owner,
        replayVersion: target.replayVersion,
        method: target.method ?? null,
      },
      applicability: request.applicability,
      affectedScope: request.applicability.surfaces,
      expectedSaving: request.expectedSaving,
      rollback: request.rollback,
      revalidation: request.revalidation,
      policies: analysis.policies,
      replay,
    };
    const digest = compilationDigest(compilation);
    // Existing writer/certification owner evaluates the exact candidate. This
    // is required even for no-new-invariant and evaluation/authorization edits.
    const authorization = await environment.authorize({
      digest,
      head: request.candidateRevision,
      targetId: target.id,
      analysisRef: request.analysisRef,
    });
    check(
      authorization.ok === true &&
        authorization.digest === digest &&
        authorization.head === request.candidateRevision &&
        text(authorization.policyVersion) &&
        text(authorization.actorId) &&
        !analysisActors(analysis).includes(authorization.actorId),
      'independent-promotion-authorization-required'
    );
    const receipt = qualifyCompilation(
      {
        ...request.learningReceipt,
        compilation: { ...compilation, authorization },
      },
      expiresAt
    );
    return { disposition: request.outcome, receipt };
  } catch (error) {
    // Do not copy provider text, unsafe evidence, git stderr or secrets out.
    return {
      disposition: 'held',
      reason:
        error instanceof CompilationError
          ? error.message
          : 'compilation-evidence-invalid',
    };
  }
}
