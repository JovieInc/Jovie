import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { finalizeEvidenceEntry } from '../../scripts/lib/mutation-evidence.mjs';
import { MIN_RATCHET_VALID } from '../../scripts/lib/mutation-sweep.mjs';
import {
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
} from './fixtures/mutation-next-target-fixture.mjs';
import { verifyHistoricalPublication } from './mutation-next-evidence.mjs';
import {
  digest,
  finishMeasurement,
  planContinuation,
  selectRequest,
  verifyPublication,
} from './mutation-next-target.mjs';

function smallSample(value = claim(), valid = 9) {
  const measured = measurement(value);
  const module = measured.state.modules[FILE];
  const provenance = module.evidence;
  Object.assign(module, {
    valid,
    killed: valid,
    survived: 0,
    score: 100,
    counts: { Killed: valid },
  });
  const { verdict } = finalizeEvidenceEntry({
    file: FILE,
    entry: module,
    baseline: { files: {} },
    configDigest: provenance.configDigest,
    runId: provenance.runId,
  });
  Object.assign(module.evidence, provenance, {
    verdict: verdict.status,
    reason: verdict.reason,
  });
  Object.assign(measured.history[0], { valid, ratchet: verdict.status });
  return measured;
}

describe('reviewed request identity and scope', () => {
  it('binds payload independent of object ordering, including predecessor attempt', () => {
    assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
    const valid = request();
    assert.match(valid.requestDigest, /^[a-f0-9]{64}$/u);
    const changed = rawRequest();
    changed.predecessor.runAttempt = '2';
    changed.predecessor.cacheKey = 'mutation-sweep-portable-v2-43867397573-2';
    assert.notEqual(
      validate([changed]).requests[0].requestDigest,
      valid.requestDigest
    );
    assert.equal(validate([rawRequest(), rawRequest()]).requests.length, 1);
    const conflict = rawRequest();
    conflict.predecessor.sha = NEXT_SHA;
    assert.equal(validate([rawRequest(), conflict]).status, 'hold');
    conflict.requestId = 'another-request';
    assert.equal(validate([rawRequest(), conflict]).status, 'hold');
  });
  for (const [path, bad] of [
    ['file', 'packages/ui/atoms/form.test.tsx'],
    ['file', 'packages/ui/../web/form.tsx'],
    ['maxFiles', 2],
    ['predecessor', undefined],
    ['predecessor.cacheKey', 'mutation-sweep-portable-v2-43867397573-2'],
    ['predecessor.sha', 'main'],
  ])
    it(`refuses request ${path}=${bad}`, () => {
      const row = rawRequest();
      set(row, path, bad);
      assert.equal(validate([row]).status, 'hold');
    });
});

describe('predecessor publication fence', () => {
  it('allows an absent historical cache without relaxing live publication or supplied cache identity', () => {
    const req = request();
    const evidence = publication(req);
    delete evidence.cache;
    assert.equal(verifyHistoricalPublication(req, evidence).status, 'ready');
    evidence.historical = true;
    evidence.requireLiveCache = false;
    assert.equal(verifyPublication(req, evidence).status, 'hold');
    for (const cache of [
      {},
      { key: req.predecessor.cacheKey, ref: 'refs/pull/1/merge' },
      { key: 'another-cache', ref: 'refs/heads/main' },
    ]) {
      evidence.cache = cache;
      assert.equal(verifyHistoricalPublication(req, evidence).status, 'hold');
      assert.equal(verifyPublication(req, evidence).status, 'hold');
    }
  });

  for (const [path, bad] of [
    ['run.status', 'in_progress'],
    ['latestRun.run_attempt', 2],
    ['run.head_repository.full_name', 'fork/Jovie'],
    ['run.head_branch', 'topic'],
    ['run.path', '.github/workflows/ci.yml'],
    ['run.head_sha', NEXT_SHA],
    ['jobs.total_count', 2],
    ['jobs.jobs.0.steps.0.conclusion', 'skipped'],
    ['jobs.jobs.0.steps.1.conclusion', 'failure'],
    ['jobs.jobs.0.steps.2.conclusion', 'failure'],
    ['artifact.expired', true],
    ['artifact.workflow_run.id', 43867397574],
    ['receipt.cacheKey', 'another-cache'],
    ['receipt.runtime.node', null],
    ['receipt.stateSha256', '0'.repeat(64)],
    ['receipt.attemptsSha256', '0'.repeat(64)],
  ])
    it(`requires authenticated historical publication after eviction: ${path}`, () => {
      const req = request();
      const evidence = publication(req);
      delete evidence.cache;
      set(evidence, path, bad);
      assert.equal(verifyHistoricalPublication(req, evidence).status, 'hold');
    });

  it('rejects corrupt structured payloads even when their byte hashes match', () => {
    for (const field of ['stateText', 'historyText']) {
      const req = request();
      const evidence = publication(req);
      evidence[field] = 'null\n';
      evidence.receipt[
        field === 'stateText' ? 'stateSha256' : 'attemptsSha256'
      ] = hash(evidence[field]);
      assert.equal(verifyPublication(req, evidence).status, 'hold');
    }
  });
  it('accepts genuine publication without converting a failed producer to green', () => {
    const req = request();
    const evidence = publication(req);
    assert.equal(verifyPublication(req, evidence).status, 'ready');
    evidence.run.conclusion = evidence.latestRun.conclusion = 'failure';
    assert.equal(verifyPublication(req, evidence).status, 'ready');
  });
  it('holds malformed nested step metadata without throwing before persistence', () => {
    const req = request();
    const evidence = publication(req);
    evidence.jobs.jobs[0].steps = [null];
    assert.equal(verifyPublication(req, evidence).status, 'hold');
  });
  for (const [path, bad] of [
    ['run.status', 'in_progress'],
    ['run.id', 43867397574],
    ['latestRun.run_attempt', 2],
    ['run.head_repository.full_name', 'fork/Jovie'],
    ['run.path', '.github/workflows/ci.yml'],
    ['run.head_sha', NEXT_SHA],
    ['jobs.total_count', 2],
    ['jobs.jobs.0.steps.0.conclusion', 'skipped'],
    ['jobs.jobs.0.steps.1.conclusion', 'failure'],
    ['jobs.jobs.0.steps.2.conclusion', 'failure'],
    ['artifact.expired', true],
    ['artifact.workflow_run.id', 43867397574],
    ['stateText', '{}'],
    ['historyText', '{}\n'],
    ['receipt.sha', NEXT_SHA],
    ['receipt.runtime.node', null],
    ['receipt.scope.maxFiles', 0],
    ['cache.key', 'mutation-sweep-portable-v2-43867397573-2'],
    ['cache.ref', 'refs/pull/1/merge'],
  ])
    it(`holds forged or incomplete publication: ${path}`, () => {
      const req = request();
      const evidence = publication(req);
      set(evidence, path, bad);
      assert.equal(verifyPublication(req, evidence).status, 'hold');
    });
});

describe('durable request replay', () => {
  it('closes a small-sample request only with the same authenticated publication', () => {
    const evidence = completedEvidence();
    const value = evidence.claims.entries[0].claim;
    const measured = smallSample(value);
    const finished = finishMeasurement(value, measured);
    assert.equal(finished.status, 'measured', finished.reason);
    const row = evidence.results.entries[0];
    row.result = finished.result;
    row.publication.stateText = JSON.stringify(measured.state);
    row.publication.historyText = measured.history
      .map(row => JSON.stringify(row))
      .join('\n');
    row.publication.receipt.stateSha256 = hash(row.publication.stateText);
    row.publication.receipt.attemptsSha256 = hash(row.publication.historyText);
    const selected = selectRequest([request()], evidence);
    assert.equal(selected.status, 'complete');
    assert.equal(selected.result.verdict, 'unknown');
    assert.equal(selected.result.valid, 9);
    for (const [path, bad] of [
      ['result.verdict', 'pass'],
      ['publication.receipt.runAttempt', '2'],
      ['publication.stateText', `${row.publication.stateText} `],
      ['publication.artifact.workflow_run.id', 501],
    ]) {
      const altered = clone(evidence);
      set(altered.results.entries[0], path, bad);
      assert.equal(selectRequest([request()], altered).status, 'hold', path);
    }
    evidence.results.entries = [];
    assert.equal(
      selectRequest([request()], evidence).status,
      'attempted-unknown'
    );
  });
  it('authenticates durable historical completion after its live cache is evicted', () => {
    const evidence = completedEvidence();
    delete evidence.results.entries[0].publication.cache;
    assert.equal(selectRequest([request()], evidence).status, 'complete');
    evidence.results.entries[0].publication.receipt.stateSha256 = '0'.repeat(
      64
    );
    assert.equal(selectRequest([request()], evidence).status, 'hold');
  });

  it('suppresses replay only for a measured result attested by canonical publication', () => {
    const evidence = completedEvidence();
    assert.equal(selectRequest([request()], evidence).status, 'complete');
    const wrongScope = clone(evidence);
    wrongScope.results.entries[0].publication.receipt.scope.maxFiles = 2;
    assert.equal(selectRequest([request()], wrongScope).status, 'hold');
    evidence.results.entries.push(clone(evidence.results.entries[0]));
    assert.equal(selectRequest([request()], evidence).status, 'complete');
    const competing = priorClaim();
    competing.claim.runId = '501';
    competing.run.id = competing.latestRun.id = 501;
    competing.jobs.jobs[0].run_id = competing.artifact.workflow_run.id = 501;
    const doubleAttempt = clone(evidence);
    doubleAttempt.claims.entries.push(competing);
    assert.equal(selectRequest([request()], doubleAttempt).status, 'hold');
    const missingClaim = clone(evidence);
    missingClaim.claims.entries = [];
    assert.equal(selectRequest([request()], missingClaim).status, 'hold');
    const fakeScore = clone(evidence);
    fakeScore.results.entries[0].result.score = 99;
    assert.equal(selectRequest([request()], fakeScore).status, 'hold');
    evidence.results.entries[0].publication.stateText += ' ';
    assert.equal(selectRequest([request()], evidence).status, 'hold');
  });
  it('survives cache eviction, but refuses an uncertain prior scoring attempt', () => {
    const evidence = selection();
    assert.equal(selectRequest([request()], evidence).status, 'ready');
    evidence.claims.entries = [priorClaim()];
    assert.equal(
      selectRequest([request()], evidence).status,
      'attempted-unknown'
    );
    evidence.claims.entries.push(clone(evidence.claims.entries[0]));
    assert.equal(selectRequest([request()], evidence).status, 'hold');
  });
  it('requires complete history and unchanged intent even after cache loss', () => {
    for (const field of ['claims', 'results']) {
      const evidence = selection();
      evidence[field].complete = false;
      assert.equal(selectRequest([request()], evidence).status, 'hold');
    }
    const evidence = selection();
    evidence.ledger = {
      schema: 'jovie.mutation-next-ledger/v1',
      requests: {
        [rawRequest().requestId]: {
          requestDigest: 'f'.repeat(64),
          status: 'claimed',
        },
      },
    };
    assert.equal(selectRequest([request()], evidence).status, 'hold');
  });
  it('retries only an authenticated terminal skipped Score', () => {
    const evidence = selection();
    evidence.claims.entries = [
      priorClaim({ status: 'completed', conclusion: 'skipped' }),
    ];
    assert.equal(selectRequest([request()], evidence).status, 'ready');
    evidence.claims.entries[0].latestRun.run_attempt = 2;
    assert.notEqual(selectRequest([request()], evidence).status, 'ready');
  });
  for (const conclusion of [null, 'timed_out', 'failure'])
    it(`retains Score ${conclusion ?? 'in_progress'} as unknown`, () => {
      const evidence = selection();
      evidence.claims.entries = [
        priorClaim({
          status: conclusion ? 'completed' : 'in_progress',
          conclusion,
        }),
      ];
      assert.equal(
        selectRequest([request()], evidence).status,
        'attempted-unknown'
      );
    });
  it('does not treat an expired claim artifact as proof of no prior attempt', () => {
    const evidence = selection();
    const prior = priorClaim();
    prior.artifact.expired = true;
    evidence.claims.entries = [prior];
    assert.notEqual(selectRequest([request()], evidence).status, 'ready');
  });
});

describe('actual bound measurement', () => {
  it('retains complete scored small samples without establishing a ratchet anchor', () => {
    assert.equal(MIN_RATCHET_VALID, 30);
    for (const valid of [1, 9, MIN_RATCHET_VALID - 1]) {
      const value = claim();
      const evidence = smallSample(value, valid);
      const module = evidence.state.modules[FILE];
      assert.equal(module.evidence.verdict, 'unknown');
      assert.equal(module.evidence.reason, 'insufficient mutation sample');
      const finished = finishMeasurement(value, evidence);
      assert.equal(finished.status, 'measured', finished.reason);
      assert.equal(finished.result.valid, valid);
      assert.equal(finished.result.verdict, 'unknown');
      assert.equal(module.highWater, undefined);
    }
  });
  it('holds an insufficient-sample claim at the ratchet minimum', () => {
    const value = claim();
    const evidence = smallSample(value, MIN_RATCHET_VALID);
    Object.assign(evidence.state.modules[FILE].evidence, {
      verdict: 'unknown',
      reason: 'insufficient mutation sample',
    });
    evidence.history[0].ratchet = 'unknown';
    assert.equal(finishMeasurement(value, evidence).status, 'hold');
  });
  for (const [path, bad] of [
    ['evidence.reason', undefined],
    [
      'evidence.reason',
      'configuration changed; reviewed control evidence required',
    ],
    ['sha', SHA],
    ['complete', false],
    ['score', null],
    ['evidence.unresolvedInputs', ['dynamic import']],
    ['evidence.inputDigest', undefined],
  ])
    it(`holds a small sample with invalid ${path}=${bad}`, () => {
      const value = claim();
      const evidence = smallSample(value);
      set(evidence.state.modules[FILE], path, bad);
      assert.equal(finishMeasurement(value, evidence).status, 'hold');
    });
  it('holds small samples without matching current-run history', () => {
    const value = claim();
    const evidence = smallSample(value);
    evidence.history[0].ratchet = 'pass';
    assert.equal(finishMeasurement(value, evidence).status, 'hold');
  });
  it('rejects additional current-run module history outside the one-file bound', () => {
    const value = claim();
    const evidence = measurement(value);
    evidence.history.push({
      ...evidence.history[0],
      file: 'packages/ui/atoms/button.tsx',
    });
    assert.equal(finishMeasurement(value, evidence).status, 'hold');
  });
  it('retains a complete small sample as a measurement', () => {
    const value = claim();
    const evidence = measurement(value);
    Object.assign(evidence.state.modules[FILE], {
      valid: 6,
      killed: 5,
      survived: 1,
      score: 83.3,
      counts: { Killed: 5, Survived: 1 },
    });
    Object.assign(evidence.history[0], { valid: 6, survived: 1, score: 83.3 });
    const result = finishMeasurement(value, evidence);
    assert.equal(result.status, 'measured', result.reason);
    assert.equal(result.result.valid, 6);
  });
  it('records complete pass and regression measurements with their actual SHA', () => {
    const value = claim();
    const evidence = measurement(value);
    const passed = finishMeasurement(value, evidence);
    assert.equal(passed.status, 'measured', passed.reason);
    assert.equal(passed.result.actualModuleSha, value.testedSha);
    evidence.state.modules[FILE].evidence.verdict = 'regression';
    evidence.history[0].ratchet = 'regression';
    const failed = finishMeasurement(value, evidence);
    assert.equal(failed.status, 'measured', failed.reason);
    assert.equal(failed.result.verdict, 'regression');
  });
  for (const [path, bad] of [
    ['sha', SHA],
    ['status', 'error'],
    ['evidence.verdict', 'unknown'],
    ['complete', false],
    ['unknown', 1],
    ['counts', { Killed: 35, Timeout: 1 }],
    ['evidence.unresolvedInputs', ['dynamic import']],
    ['evidence.configDigest', undefined],
    ['evidence.selectionDigest', undefined],
    ['evidence.inputDigest', undefined],
  ])
    it(`does not fulfill unscored, partial or unbound ${path}`, () => {
      const value = claim();
      const evidence = measurement(value);
      set(evidence.state.modules[FILE], path, bad);
      assert.equal(finishMeasurement(value, evidence).status, 'hold');
    });
  for (const [path, bad] of [
    ['state.sweepSequences.packages/ui', 4],
    ['history', []],
    ['history.0.runUrl', 'https://github.com/JovieInc/Jovie/actions/runs/501'],
    ['history.0.score', 50],
  ])
    it(`rejects stale or mismatched attempt history: ${path}`, () => {
      const value = claim();
      const evidence = measurement(value);
      set(evidence, path, bad);
      assert.equal(finishMeasurement(value, evidence).status, 'hold');
    });
});

describe('one continuation POST per producer run', () => {
  it('holds malformed inventory rows without throwing away the pending intent', () => {
    const input = continuation();
    input.inventory.entries = [null];
    assert.equal(planContinuation(input).status, 'hold');
  });
  it('continues pending intent even without broad work', () => {
    const input = continuation();
    input.pending = true;
    input.rollingEligible = false;
    const result = planContinuation(input);
    assert.equal(result.status, 'ready', result.reason);
    assert.equal(result.outbox.maxFiles, 1);
    assert.deepEqual(result.outbox.payload.inputs, {
      mode: 'sweep',
      max_files: '1',
    });
  });
  for (const [path, bad] of [
    ['publicationVerified', false],
    ['inventory.complete', false],
    [
      'inventory.entries',
      [
        { id: 500, status: 'in_progress' },
        { id: 501, status: 'queued' },
      ],
    ],
    [
      'inventory.entries',
      [
        { id: 500, status: 'in_progress' },
        { id: 501, status: 'in_progress' },
      ],
    ],
    ['inventory.entries', []],
    ['outboxes.complete', false],
  ])
    it(`does not dispatch without exclusive, published, complete ${path}`, () => {
      const input = continuation();
      set(input, path, bad);
      assert.notEqual(planContinuation(input).status, 'ready');
    });
  it('never repeats an uncertain POST on another attempt of the same run', () => {
    const first = planContinuation(continuation());
    assert.equal(first.status, 'ready', first.reason);
    const replay = continuation();
    replay.runAttempt = '2';
    replay.outboxes.entries = [first.outbox];
    assert.equal(planContinuation(replay).status, 'attempted-unknown');
  });
});
