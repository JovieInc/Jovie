import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeFailureEvents } from '../rolling-ci-dispatch.mjs';
import {
  planOfflineFailureDispositions,
  prepareOfflineFailureTriage,
  settleOfflineFailure,
} from '../rolling-ci-failure-disposition.mjs';

const head = 'a'.repeat(40);
const now = '2026-09-19T20:00:00.000Z';
const path = 'apps/web/lib/fixture-total.js';
const digest = value => createHash('sha256').update(value).digest('hex');
function fixture(overrides = {}) {
  const envelope = {
    repository: 'JovieInc/Jovie',
    prNumber: 17,
    headSha: head,
    workflowRunId: 9001,
    workflowRunAttempt: 1,
    checkSuiteId: 44,
    failedJobs: [{ name: 'ci-fast', steps: ['Typecheck'] }],
    source: {
      eventName: 'workflow_run',
      workflow: 'CI',
      producerEvent: 'pull_request',
      trustedPolicyRef: 'main',
      workflowPath: '.github/workflows/ci.yml',
    },
    ...overrides,
  };
  const events = normalizeFailureEvents(envelope);
  const triage = {},
    observations = {};
  for (const event of events) {
    const request = prepareOfflineFailureTriage(event);
    triage[event.fingerprint] = {
      kind: 'canned',
      model: request.expectedModel,
      provider: 'fixture',
      binding: request.binding,
      classification: 'source',
    };
    observations[event.fingerprint] = {
      binding: request.binding,
      reproduced: true,
      paths: [path],
    };
  }
  return {
    envelope,
    liveHead: envelope.headSha,
    now,
    conclusion: 'failure',
    implementer: 'fixture-implementer',
    headRefName: 'codex/fixture',
    fxAdapter: { name: 'fx', authConfigured: true },
    handoff: {
      schema: 'jovie-rolling-ci-handoff/v1',
      pr: 17,
      head: envelope.headSha,
      status: 'handed-off',
      acceptanceCriteria: ['hidden oracle passes'],
      remainingChecks: ['ci-fast'],
      failureFingerprints: events.map(e => e.fingerprint),
      remediationOwner: 'fixture-implementer',
    },
    triage,
    observations,
    baseSha: 'b'.repeat(40),
    changedFiles: [
      {
        filename: path,
        status: 'modified',
        mode: '100644',
        blobSha: 'c'.repeat(40),
      },
    ],
  };
}
const first = input => planOfflineFailureDispositions(input).dispositions[0];
const triageOf = input => Object.values(input.triage)[0];
const observationOf = input => Object.values(input.observations)[0];
function settlement(disposition = first(fixture())) {
  const patchSha256 = digest('fixture patch');
  return {
    disposition,
    liveHead: disposition.head,
    now,
    patchSha256,
    changedPaths: [path],
    tests: { head: disposition.head, patchSha256, passed: true },
    review: {
      head: disposition.head,
      patchSha256,
      accepted: true,
      reviewer: 'fixture-independent-oracle',
    },
  };
}

describe('offline failure accounting', () => {
  it('binds triage to the full event and never grants production or model authority', () => {
    const input = fixture();
    const result = planOfflineFailureDispositions(input);
    expect(result.dispositions[0]).toMatchObject({
      action: 'prepare-offline-patch',
      owner: 'fx',
      mode: 'offline',
      productionAuthorized: false,
      modelCalls: 0,
      paths: [path],
      plan: { expectedHeadOid: head, headRefName: 'codex/fixture' },
    });
    expect(result.state.claim).toMatchObject({
      status: 'active',
      writer: 'fx',
      head,
    });
    const event = normalizeFailureEvents(input.envelope)[0];
    const binding = prepareOfflineFailureTriage(event).binding;
    for (const mutation of [
      { head: 'b'.repeat(40) },
      { delivery: 'new-attempt' },
      { failedSteps: ['other'] },
      { pr: 18 },
      { repository: 'other/repo' },
    ]) {
      expect(
        prepareOfflineFailureTriage({ ...event, ...mutation }).binding
      ).not.toBe(binding);
    }
  });

  it.each([
    ['absent', undefined],
    [
      'untrusted source',
      { ...fixture(), envelope: { ...fixture().envelope, source: {} } },
    ],
    ['malformed head', { ...fixture(), liveHead: 'invalid' }],
    ['invalid time', { ...fixture(), now: 'invalid' }],
    [
      'empty jobs',
      { ...fixture(), envelope: { ...fixture().envelope, failedJobs: [] } },
    ],
  ])('accounts for %s input without authorizing a patch', (_label, input) => {
    expect(first(input)).toMatchObject({
      action: 'stop',
      reason: 'invalid-event',
      owner: 'CI Platform',
      modelCalls: 0,
    });
  });

  it.each([
    'cancelled',
    'timed_out',
    'neutral',
    'skipped',
    'action_required',
    undefined,
  ])('accounts for %s completion', conclusion => {
    expect(first({ ...fixture(), conclusion })).toMatchObject({
      action: 'escalate',
      reason: 'non-failure-terminal-event',
    });
  });
  it('supersedes stale heads and closes recovered checks before consulting triage', () => {
    expect(first({ ...fixture(), liveHead: 'b'.repeat(40) }).reason).toBe(
      'stale-head'
    );
    expect(
      first({ ...fixture(), conclusion: 'success', triage: null }).reason
    ).toBe('check-recovered');
  });
  it.each(['credential', 'budget'])(
    'routes independent %s blockers despite model source classification',
    blocker => {
      const input = fixture();
      observationOf(input).blocker = blocker;
      expect(first(input)).toMatchObject({
        action: 'route',
        reason: blocker,
        owner: 'CI Platform',
      });
    }
  );
  it('preserves implementer ownership with a finite follow-up deadline', () => {
    const input = fixture();
    expect(first({ ...input, handoff: null })).toMatchObject({
      action: 'defer',
      owner: input.implementer,
      deadline: '2026-09-19T20:05:00.000Z',
    });
    input.handoff.status = 'active';
    input.handoff.leaseExpiresAt = '2026-09-19T20:02:00.000Z';
    expect(first(input)).toMatchObject({
      action: 'defer',
      deadline: input.handoff.leaseExpiresAt,
    });
    input.handoff.leaseExpiresAt = '2026-09-19T19:59:00.000Z';
    expect(first(input).action).toBe('prepare-offline-patch');
    expect(first({ ...input, implementer: '' }).reason).toBe('missing-owner');
  });
  it.each([
    { pr: 18 },
    { pr: '17' },
    { status: 'active', leaseExpiresAt: 'bad' },
    { head: 'b'.repeat(40) },
    { schema: 'other' },
  ])('rejects invalid handoff %j', mutation => {
    const input = fixture();
    Object.assign(input.handoff, mutation);
    expect(first(input).reason).toBe('invalid-handoff');
  });
  it('routes missing adapter credentials without inventing an alternative', () => {
    expect(first({ ...fixture(), fxAdapter: null }).reason).toBe(
      'adapter-auth-missing'
    );
  });
  it.each([
    { kind: 'live' },
    { model: 'other/model' },
    { provider: 'gateway' },
    { binding: 'stale' },
    { classification: 'ignore-policy' },
  ])('rejects mismatched canned triage %j', mutation => {
    const input = fixture();
    Object.assign(triageOf(input), mutation);
    expect(first(input).reason).toBe('triage-unavailable-or-mismatched');
  });
  it('accounts for missing triage', () => {
    expect(first({ ...fixture(), triage: null }).reason).toBe(
      'triage-unavailable-or-mismatched'
    );
  });
  it.each([
    'credential',
    'budget',
    'platform',
    'transient',
    'flaky',
    'unknown',
  ])('routes %s without producing a patch', classification => {
    const input = fixture();
    triageOf(input).classification = classification;
    expect(first(input)).toMatchObject({
      action: 'route',
      reason: classification,
      owner: ['flaky', 'unknown'].includes(classification)
        ? input.implementer
        : 'CI Platform',
    });
  });
  it.each([
    { binding: 'stale' },
    { reproduced: false },
    { paths: null },
    { paths: [] },
  ])('requires reproduction evidence %j', mutation => {
    const input = fixture();
    Object.assign(observationOf(input), mutation);
    expect(first(input).reason).toBe('reproduction-evidence-missing');
  });
  it('requires an independent observation even when triage asserts reproduction', () => {
    const input = fixture();
    Object.assign(triageOf(input), {
      reproduced: true,
      paths: [path],
      productionAuthorized: true,
      owner: 'attacker',
    });
    expect(first({ ...input, observations: null }).reason).toBe(
      'reproduction-evidence-missing'
    );
    expect(first(input)).toMatchObject({
      owner: 'fx',
      productionAuthorized: false,
    });
  });
  it.each([
    '.github/workflows/ci.yml',
    'apps/web/lib/auth/session.ts',
    '../escape.js',
    'apps/web/tests/unit/fixture.test.js',
  ])('routes protected path %s', protectedPath => {
    const input = fixture();
    observationOf(input).paths = [protectedPath];
    expect(first(input).reason).toBe('protected-or-unsupported-path');
  });
  it('links duplicate events and preserves the one-delivery limit across attempts', () => {
    const input = fixture();
    const result = planOfflineFailureDispositions(input);
    expect(
      first({ ...input, priorDispositions: [null, ...result.dispositions] })
    ).toMatchObject({
      action: 'deduplicate',
      originalEventKey: result.dispositions[0].eventKey,
    });
    expect(
      first({
        ...input,
        priorDispositions: [{ ...result.dispositions[0], owner: '' }],
      }).action
    ).toBe('prepare-offline-patch');
    expect(first({ ...input, priorState: result.state }).reason).toBe(
      'deduplicate_delivery'
    );
    const retry = fixture({ workflowRunAttempt: 2 });
    expect(first({ ...retry, priorState: result.state }).reason).toBe(
      'terminal_configuration_incident'
    );
    result.state.claim.writer = 'another-writer';
    expect(first({ ...retry, priorState: result.state }).reason).toBe(
      'reject_competing_writer'
    );
  });
  it.each(['invalid', '2026-09-19T19:59:00.000Z'])(
    'escalates overdue pending ownership instead of suppressing it: %s',
    deadline => {
      const input = fixture();
      const prior = first(input);
      prior.deadline = deadline;
      expect(first({ ...input, priorDispositions: [prior] })).toMatchObject({
        action: 'escalate',
        reason: 'prior-owner-deadline-elapsed',
        owner: prior.owner,
      });
    }
  );
  it('accounts for every concurrent failure while issuing only one candidate', () => {
    const input = fixture({
      failedJobs: [
        { name: 'a', steps: ['Typecheck'] },
        { name: 'b', steps: ['Lint'] },
      ],
    });
    const result = planOfflineFailureDispositions(input);
    expect(result.dispositions.map(d => d.action)).toEqual([
      'prepare-offline-patch',
      'defer',
    ]);
    expect(result.dispositions[1]).toMatchObject({
      reason: 'another-failure-owned',
      owner: 'fx',
      deadline: '2026-09-19T20:05:00.000Z',
    });
  });
  it.each([{ pr: 18 }, { repository: 'other/repo' }, { writer: '' }])(
    'rejects invalid existing ownership %j',
    mutation => {
      const input = fixture();
      const { state } = planOfflineFailureDispositions(input);
      Object.assign(state.claim, mutation);
      expect(first({ ...input, priorState: state }).reason).toBe(
        'invalid-dispatch-state'
      );
    }
  );
  it('accounts for corrupt dispatcher state and unsafe branch plans', () => {
    expect(first({ ...fixture(), priorState: {} }).reason).toBe(
      'invalid-dispatch-state'
    );
    expect(first({ ...fixture(), headRefName: 'main' }).reason).toBe(
      'invalid-dispatch-state'
    );
  });
});

describe('exact-artifact offline settlement', () => {
  it('requires a candidate and the current head', () => {
    expect(
      settleOfflineFailure({ ...settlement(), disposition: null }).reason
    ).toBe('not-a-patch-candidate');
    expect(
      settleOfflineFailure({ ...settlement(), liveHead: 'b'.repeat(40) }).action
    ).toBe('supersede');
  });
  it.each(['invalid', '2026-09-19T20:05:00.000Z', '2026-09-19T20:06:00.000Z'])(
    'stops after invalid or expired lease: %s',
    timestamp => {
      expect(
        settleOfflineFailure({ ...settlement(), now: timestamp }).reason
      ).toBe('lease-expired-or-invalid');
    }
  );
  it('rejects an invalid deadline', () => {
    const input = settlement();
    input.disposition.deadline = 'invalid';
    expect(settleOfflineFailure(input).reason).toBe('lease-expired-or-invalid');
  });
  it.each([null, [], ['apps/web/lib/other.js'], ['.github/workflows/ci.yml']])(
    'rejects patch scope changes %j',
    changedPaths => {
      expect(
        settleOfflineFailure({ ...settlement(), changedPaths }).reason
      ).toBe('patch-scope-mismatch');
    }
  );
  it('revalidates protected paths even if the candidate was altered', () => {
    const input = settlement();
    input.disposition.paths = ['.github/workflows/ci.yml'];
    input.changedPaths = input.disposition.paths;
    expect(settleOfflineFailure(input).reason).toBe('patch-scope-mismatch');
    delete input.disposition.paths;
    expect(settleOfflineFailure(input).reason).toBe('patch-scope-mismatch');
  });
  it('rejects malformed patch digests', () => {
    expect(
      settleOfflineFailure({ ...settlement(), patchSha256: 'bad' }).reason
    ).toBe('invalid-patch-digest');
  });
  it.each([
    null,
    { head: 'wrong' },
    { patchSha256: 'wrong' },
    { passed: false },
  ])('requires fresh passing tests %j', mutation => {
    const input = settlement();
    input.tests = mutation && { ...input.tests, ...mutation };
    expect(settleOfflineFailure(input).reason).toBe('fresh-tests-missing');
  });
  it.each([
    null,
    { head: 'wrong' },
    { patchSha256: 'wrong' },
    { accepted: false },
    { reviewer: '' },
    { reviewer: 'fx' },
  ])('requires independent review %j', mutation => {
    const input = settlement();
    input.review = mutation && { ...input.review, ...mutation };
    expect(settleOfflineFailure(input).reason).toBe(
      'independent-review-missing'
    );
  });
  it('labels a verified fixture as offline with no production authority', () => {
    expect(settleOfflineFailure(settlement())).toMatchObject({
      action: 'offline-verified',
      reason: 'fixture-only',
      productionAuthorized: false,
      modelCalls: 0,
    });
  });
});

it('reproduces a synthetic defect, stages one bounded repair, and checks the exact artifact with an independent oracle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'offline-failure-'));
  const repo = join(dir, 'repo');
  mkdirSync(repo);
  const git = args => {
    const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  };
  const smoke = filename =>
    spawnSync(
      process.execPath,
      [
        '-e',
        `const assert = require('node:assert/strict'); assert.equal(require(process.argv[1]).total([1, 2]), 3);`,
        filename,
      ],
      { encoding: 'utf8' }
    );
  const oracle = filename =>
    spawnSync(
      process.execPath,
      [
        '-e',
        `const assert = require('node:assert/strict'); const { total } = require(process.argv[1]); assert.equal(total([]), 0); assert.equal(total([3, -2, 4]), 5); assert.equal(total([0, 0]), 0);`,
        filename,
      ],
      { encoding: 'utf8' }
    );
  try {
    git(['init', '--quiet']);
    git(['config', 'user.email', 'fixture@example.invalid']);
    git(['config', 'user.name', 'Offline Fixture']);
    const source = join(repo, path);
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(
      source,
      'exports.total = values => values.reduce((sum, value) => sum + value, 1);\n'
    );
    git(['add', '.']);
    git(['commit', '--quiet', '-m', 'synthetic failing fixture']);
    expect(oracle(source).status).not.toBe(0);
    const input = fixture({ headSha: git(['rev-parse', 'HEAD']) });
    const disposition = first(input);
    expect(disposition.action).toBe('prepare-offline-patch');
    writeFileSync(
      source,
      'exports.total = values => values.reduce((sum, value) => sum + value, 0);\n'
    );
    const planFile = join(dir, 'plan.json');
    writeFileSync(planFile, JSON.stringify(disposition.plan));
    const output = join(dir, 'artifact');
    const staged = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, '../rolling-ci-fx.mjs'),
        'hosted-stage',
        '--plan',
        planFile,
        '--repository',
        repo,
        '--output',
        output,
      ],
      { encoding: 'utf8' }
    );
    expect(staged.status, staged.stderr).toBe(0);
    const changes = JSON.parse(
      readFileSync(join(output, 'changes.json'), 'utf8')
    );
    const artifact = join(output, 'files', path);
    expect(changes).toHaveLength(1);
    expect(changes[0].sha256).toBe(digest(readFileSync(artifact)));
    const patchSha256 = digest(readFileSync(join(output, 'repair.patch')));
    const localTest = smoke(source),
      independentArtifactTest = oracle(artifact);
    expect(localTest.status, localTest.stderr).toBe(0);
    expect(independentArtifactTest.status, independentArtifactTest.stderr).toBe(
      0
    );
    const proof = { head: input.liveHead, patchSha256 };
    const result = settleOfflineFailure({
      disposition,
      liveHead: git(['rev-parse', 'HEAD']),
      now,
      patchSha256,
      changedPaths: changes.map(c => c.path),
      tests: { ...proof, passed: localTest.status === 0 },
      review: {
        ...proof,
        accepted: independentArtifactTest.status === 0,
        reviewer: 'fixture-hidden-oracle',
      },
    });
    expect(result).toMatchObject({
      action: 'offline-verified',
      productionAuthorized: false,
      modelCalls: 0,
    });
    expect(first({ ...input, priorDispositions: [result] }).action).toBe(
      'deduplicate'
    );
    expect(git(['rev-parse', 'HEAD'])).toBe(input.liveHead);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
