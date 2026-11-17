import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildClaim,
  finishMeasurement,
  validateRequests,
} from '../mutation-next-target.mjs';

const FILE = 'packages/ui/atoms/form.tsx';
const SHA = 'a'.repeat(40);
const NEXT_SHA = 'b'.repeat(40);
const hash = text => createHash('sha256').update(text).digest('hex');
const clone = value => structuredClone(value);
const inventory = entries => ({ complete: true, entries });
const rawRequest = () => ({
  requestId: 'jov-12636-form-next',
  file: FILE,
  maxFiles: 1,
  predecessor: {
    runId: '43867397573',
    runAttempt: '1',
    sha: SHA,
    cacheKey: 'mutation-sweep-portable-v2-43867397573-1',
    artifactName: 'mutation-sweep-43867397573',
  },
});
const documentFor = requests => ({
  schema: 'jovie.mutation-next-targets/v1',
  requests,
});
const validate = requests =>
  validateRequests(documentFor(requests), {
    tracked: new Set([FILE]),
    isFile: file => file === FILE,
  });
function request() {
  const result = validate([rawRequest()]);
  assert.equal(result.status, 'ready', result.reason);
  return result.requests[0];
}
function publication(req = request()) {
  const pred = req.predecessor;
  const run = {
    id: Number(pred.runId),
    run_attempt: Number(pred.runAttempt),
    head_sha: pred.sha,
    head_branch: 'main',
    head_repository: { full_name: 'JovieInc/Jovie' },
    repository: { full_name: 'JovieInc/Jovie' },
    path: '.github/workflows/mutation-diff.yml',
    status: 'completed',
    conclusion: 'success',
    event: 'workflow_dispatch',
  };
  const stateText = JSON.stringify({ schemaVersion: 1, modules: {} });
  const historyText =
    '{"file":"packages/ui/atoms/form.tsx","status":"unknown"}\n';
  return {
    run,
    latestRun: clone(run),
    stateText,
    historyText,
    jobs: {
      total_count: 1,
      jobs: [
        {
          id: 123,
          run_id: run.id,
          run_attempt: run.run_attempt,
          head_sha: pred.sha,
          name: 'Rolling mutation sweep',
          status: 'completed',
          steps: [
            'Snapshot sweep state and survivor tasks',
            'Save sweep state',
            'Upload sweep state and survivor tasks',
          ].map(name => ({
            name,
            conclusion: 'success',
            status: 'completed',
          })),
        },
      ],
    },
    artifact: {
      id: 123,
      name: pred.artifactName,
      expired: false,
      workflow_run: { id: run.id, head_sha: pred.sha },
    },
    receipt: {
      schema: 'jovie.mutation-producer-receipt/v1',
      sha: pred.sha,
      runId: pred.runId,
      runAttempt: pred.runAttempt,
      cacheKey: pred.cacheKey,
      runtime: { node: '24.22.3' },
      scope: { kind: 'ui', include: FILE, maxFiles: 1 },
      stateSha256: hash(stateText),
      attemptsSha256: hash(historyText),
    },
    cache: { key: pred.cacheKey, ref: 'refs/heads/main' },
  };
}
function claim(req = request()) {
  const result = buildClaim(req, {
    runId: '500',
    runAttempt: '1',
    transportSha: NEXT_SHA,
    testedSha: NEXT_SHA,
    ledgerDigest: 'c'.repeat(64),
    previousSequence: 4,
  });
  assert.equal(result.status, 'ready', result.reason);
  return result.claim;
}
const selection = () => ({
  ledger: null,
  claims: inventory([]),
  results: inventory([]),
});
const continuation = () => ({
  runId: '500',
  runAttempt: '1',
  publicationVerified: true,
  inventory: inventory([{ id: 500, status: 'in_progress' }]),
  pending: false,
  rollingEligible: true,
  outboxes: inventory([]),
});
function priorClaim(score = { status: 'completed', conclusion: 'success' }) {
  const value = claim();
  const run = {
    ...publication().run,
    id: Number(value.runId),
    run_attempt: Number(value.runAttempt),
    head_sha: value.transportSha,
  };
  return {
    claim: value,
    run,
    latestRun: clone(run),
    jobs: {
      total_count: 1,
      jobs: [
        {
          id: 456,
          run_id: run.id,
          run_attempt: run.run_attempt,
          head_sha: run.head_sha,
          status: 'completed',
          name: 'Rolling mutation sweep',
          steps: [{ name: 'Score the next modules', ...score }],
        },
      ],
    },
    artifact: {
      id: 456,
      name: `mutation-next-claim-${value.requestId}`,
      expired: false,
      workflow_run: { id: run.id, head_sha: run.head_sha },
    },
  };
}
function measurement(value = claim()) {
  const sequence = value.previousSequence + 1;
  const at = '2026-11-16T14:00:00.000Z';
  const runUrl = `https://github.com/JovieInc/Jovie/actions/runs/${value.runId}`;
  const entry = {
    sha: value.testedSha,
    status: 'scored',
    score: 100,
    valid: 35,
    killed: 35,
    survived: 0,
    unknown: 0,
    complete: true,
    counts: { Killed: 35 },
    at,
    evidence: {
      schemaVersion: 1,
      runId: sequence,
      verdict: 'pass',
      configDigest: 'a'.repeat(64),
      selectionDigest: 'b'.repeat(64),
      inputDigest: 'c'.repeat(64),
      inputs: [value.file],
      unresolvedInputs: [],
    },
  };
  return {
    state: {
      schemaVersion: 1,
      sweepSequences: { 'packages/ui': sequence },
      modules: { [value.file]: entry },
    },
    runUrl,
    history: [
      {
        file: value.file,
        sha: value.testedSha,
        at,
        status: 'scored',
        score: 100,
        valid: 35,
        survived: 0,
        ratchet: 'pass',
        runUrl,
      },
    ],
  };
}

function set(value, path, replacement) {
  const keys = path.split('.');
  const key = keys.pop();
  keys.reduce((row, name) => row[name], value)[key] = replacement;
}
function completedEvidence() {
  const prior = priorClaim();
  const measured = measurement(prior.claim);
  const finished = finishMeasurement(prior.claim, measured);
  assert.equal(finished.status, 'measured', finished.reason);
  const proof = publication({
    predecessor: {
      runId: prior.claim.runId,
      runAttempt: prior.claim.runAttempt,
      sha: prior.claim.testedSha,
      cacheKey: `mutation-sweep-portable-v2-${prior.claim.runId}-${prior.claim.runAttempt}`,
      artifactName: `mutation-sweep-${prior.claim.runId}`,
    },
  });
  proof.stateText = JSON.stringify(measured.state);
  proof.historyText = measured.history
    .map(row => JSON.stringify(row))
    .join('\n');
  proof.receipt.stateSha256 = hash(proof.stateText);
  proof.receipt.attemptsSha256 = hash(proof.historyText);
  return {
    ledger: null,
    claims: inventory([prior]),
    results: inventory([{ result: finished.result, publication: proof }]),
  };
}

export {
  claim,
  clone,
  completedEvidence,
  continuation,
  FILE,
  hash,
  measurement,
  NEXT_SHA,
  priorClaim,
  publication,
  rawRequest,
  request,
  SHA,
  selection,
  set,
  validate,
};
