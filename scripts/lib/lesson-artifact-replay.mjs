import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import {
  readInvariantRegistry,
  validateInvariantRegistry,
} from '../invariants/registry.mjs';
import { compilationDigest } from './lesson-compilation-proof.mjs';

export const SHA = /^[a-f0-9]{40}$/u;
export const text = value =>
  typeof value === 'string' && value.trim().length > 0;
export class CompilationError extends Error {}
export const check = (condition, reason) => {
  if (!condition) throw new CompilationError(reason);
};
export const analysisActors = analysis =>
  analysis.resolutions.flatMap(row => {
    const route = row.receipt.selectedRoute;
    return [route.id, route.tuple.provider, route.tuple.model];
  });

export function paths(values) {
  check(
    Array.isArray(values) && values.length > 0 && values.length <= 32,
    'scope-required'
  );
  check(new Set(values).size === values.length, 'duplicate-scope');
  for (const value of values) {
    check(
      text(value) &&
        posix.normalize(value) === value &&
        !/^(?:\/|\.)|[\\:*?\[\]{}\s]/u.test(value),
      'unsafe-or-overbroad-path'
    );
  }
}

/** No checkout, shell interpolation, candidate import, network or credentials.
 * git show reads regular blobs only, including ancestor symlink rejection.
 */
export function readReplaySource(repoRoot, revision, path) {
  check(SHA.test(revision), 'invalid-source-revision');
  paths([path]);
  const run = args =>
    execFileSync('git', ['-C', repoRoot, ...args], {
      encoding: 'utf8',
      timeout: 5000,
      maxBuffer: 1_048_576,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const row = run(['ls-tree', revision, '--', path]);
  check(
    /^100(?:644|755) blob /u.test(row),
    'replay-source-must-be-regular-blob'
  );
  return run(['show', `${revision}:${path}`]);
}

/** Evidence-suite labels come from the independent evidence owner. Each port
 * runs its existing executable validator/fixture/method, not a proof assertion
 * from the request. A passing repaired example alone is insufficient.
 */
export async function replayLessonArtifact(
  request,
  analysis,
  target,
  environment
) {
  const suite = await environment.loadReplay(request.replayRef);
  const authors = analysisActors(analysis);
  check(
    suite.access === 'development' &&
      text(suite.producerId) &&
      !authors.includes(suite.producerId),
    'unsafe-or-dependent-replay'
  );
  check(
    suite.analysisRef === request.analysisRef &&
      suite.originRevision === analysis.attemptGraph.work.revision &&
      suite.candidateRevision === request.candidateRevision &&
      suite.artifactVersion === request.artifact.version,
    'replay-binding-mismatch'
  );
  check(
    Array.isArray(suite.cases) &&
      suite.cases.length >= 2 &&
      suite.cases.length <= 32,
    'bounded-replay-required'
  );
  check(
    new Set(suite.cases.map(row => row.id)).size === suite.cases.length,
    'duplicate-replay-case'
  );
  const originCases = suite.cases.filter(row => row.role === 'origin');
  const controls = suite.cases.filter(row => row.role === 'control');
  check(
    originCases.length === 1 && controls.length > 0,
    'origin-and-valid-controls-required'
  );
  const originSource = readReplaySource(
    environment.repoRoot,
    suite.originRevision,
    target.path
  );
  const candidateSource = readReplaySource(
    environment.repoRoot,
    request.candidateRevision,
    target.path
  );
  check(
    compilationDigest(candidateSource) === request.artifact.version,
    'artifact-version-mismatch'
  );
  if (target.kind === 'skill-method') {
    check(
      text(target.method) && /\.[cm]?[jt]s$|\.py$/u.test(target.path),
      'executable-method-required'
    );
  }
  // Reuse the registry's full binding validation, including production consumers
  // and deliberate-red references. No parallel invariant inventory is written.
  const registry = readInvariantRegistry(environment.repoRoot);
  const validation = validateInvariantRegistry(registry, {
    repoRoot: environment.repoRoot,
  });
  check(validation.ok, 'invariant-artifact-invalid');
  if (target.invariantId) {
    const invariant = registry.invariants.find(
      row => row.id === target.invariantId
    );
    check(
      invariant?.lifecycle.state === 'adopted' &&
        invariant.enforcementConsumers.some(
          row =>
            row.path === target.path &&
            (!row.repo || row.repo === 'JovieInc/Jovie')
        ),
      'invariant-target-unbound'
    );
  }

  const results = [];
  const covered = new Set();
  for (const row of suite.cases) {
    check(
      ['origin', 'control', 'sibling'].includes(row.role),
      'unsupported-replay-role'
    );
    check(row.access === 'development', 'unsafe-replay-case');
    check(SHA.test(row.revision), 'invalid-replay-revision');
    if (row.role === 'origin')
      check(row.revision === suite.originRevision, 'origin-revision-mismatch');
    const applies = lessonApplies(request.applicability, row);
    if (row.role !== 'control')
      check(applies, 'predicate-misses-failure-or-sibling');
    const fixtureSource = readReplaySource(
      environment.repoRoot,
      row.revision,
      row.path
    );
    const result = await target.replay(
      Object.freeze({
        originSource,
        candidateSource,
        fixtureSource,
        context: Object.freeze({ ...row }),
        applies,
      })
    );
    if (row.role === 'control') {
      check(
        result.origin === 'pass' && result.candidate === 'pass',
        'valid-control-rejected'
      );
    } else {
      check(
        result.origin === 'fail' &&
          ['prevented', 'detected'].includes(result.candidate) &&
          result.causeKey === analysis.finding.rootCause.causeKey,
        'unsupported-or-coincidental-replay'
      );
      covered.add(row.surface);
    }
    results.push({
      id: row.id,
      revision: row.revision,
      path: row.path,
      applies,
      origin: result.origin,
      candidate: result.candidate,
      causeKey: result.causeKey ?? null,
    });
  }
  // Controls exercise both the repair's false positives and the predicate's
  // boundary. Broad claims owe every named sibling, with a fixed upper bound.
  check(
    controls.some(row => lessonApplies(request.applicability, row)) &&
      controls.some(row => !lessonApplies(request.applicability, row)),
    'predicate-boundary-control-required'
  );
  check(
    request.applicability.surfaces.every(surface => covered.has(surface)),
    'sibling-sweep-incomplete'
  );
  if (analysis.lessonClass !== 'local') {
    check(
      covered.size > 1 &&
        analysis.affectedScope.every(surface => covered.has(surface)) &&
        suite.cases.some(row => row.role === 'sibling'),
      'broad-lesson-needs-sibling-sweep'
    );
  }
  return {
    producerId: suite.producerId,
    replayRef: request.replayRef,
    results,
  };
}

/** Finite, exact applicability; arbitrary code, regex and wildcard claims are
 * intentionally unsupported. New dimensions require the existing owner. */
export function lessonApplies(predicate, context) {
  return (
    predicate.tenantId === context.tenantId &&
    predicate.cohortId === context.cohortId &&
    predicate.productId === context.productId &&
    predicate.workClass === context.workClass &&
    predicate.surfaces.includes(context.surface)
  );
}
