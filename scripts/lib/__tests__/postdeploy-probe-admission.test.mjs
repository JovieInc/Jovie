import { expect, it } from 'vitest';
import {
  admissionArtifactName,
  evaluateProbeAdmission,
  PROBE_JOBS,
  recordProbeAttempt,
  reserveProbeAttempt,
  validateProbeReservation,
} from '../postdeploy-probe-admission.mjs';

const NOW = '2026-11-14T06:30:00Z';
const context = (overrides = {}) => ({
  repository: 'JovieInc/Jovie',
  workflowPath: '.github/workflows/postdeploy-probes.yml',
  workflowSha: 'c'.repeat(40),
  runId: 300,
  runAttempt: 1,
  mode: 'automatic',
  now: NOW,
  target: {
    sha: 'a'.repeat(40),
    deploymentId: 'dpl_test123',
    origin: 'https://jovie-test123-jovie.vercel.app',
    policyDigest: 'b'.repeat(64),
  },
  ...overrides,
});

/** @param {number} runId @param {number} attempt @param {string} conclusion */
function jobs(runId, attempt, conclusion = 'success') {
  return {
    total_count: 3,
    jobs: Object.entries(PROBE_JOBS).map(([key, definition], index) => ({
      id: runId * 10 + index,
      run_id: runId,
      run_attempt: attempt,
      name: definition.name,
      head_sha: 'c'.repeat(40), // Workflow source is not landed production.
      head_branch: 'main',
      status: 'completed',
      conclusion: key === 'smoke' ? conclusion : 'success',
      completed_at: `2026-11-14T0${runId === 100 ? 4 : 5}:00:00Z`,
      steps: definition.steps.map(name => ({
        name,
        status: 'completed',
        conclusion: key === 'smoke' ? conclusion : 'success',
      })),
    })),
  };
}

/** @param {number} runId @param {number} attempt */
function run(runId, attempt) {
  return {
    id: runId,
    run_attempt: attempt,
    repository: { full_name: 'JovieInc/Jovie' },
    head_repository: { full_name: 'JovieInc/Jovie' },
    head_branch: 'main',
    path: '.github/workflows/postdeploy-probes.yml',
    event: 'workflow_run',
    status: 'completed',
    conclusion: 'failure', // Golden-path certification can fail separately.
    head_sha: 'c'.repeat(40),
  };
}

function artifact(runId = 100, conclusion = 'success') {
  const evidence = jobs(runId, 1, conclusion);
  const ledger = reserveProbeAttempt(
    context({ runId, now: `2026-11-14T0${runId === 100 ? 4 : 5}:00:00Z` })
  );
  return {
    id: runId,
    name: admissionArtifactName(context().target),
    expired: false,
    workflow_run: { id: runId },
    ledger,
    proofs: [{ complete: true, run: run(runId, 1), jobs: evidence }],
  };
}
const history = (...artifacts) => ({
  complete: true,
  total_count: artifacts.length,
  artifacts,
});

it('admits the first candidate only from a complete empty exact namespace', () => {
  expect(evaluateProbeAdmission(context(), history())).toMatchObject({
    decision: 'admit-initial',
    admitted: true,
    failureCount: 0,
  });
});

it('keeps immutable capsules from both failed rerun attempts in the budget', () => {
  const first = artifact(100, 'failure');
  const second = {
    ...artifact(100, 'failure'),
    id: 101,
    name: `${first.name}-attempt-2`,
    ledger: reserveProbeAttempt(
      context({ runId: 100, runAttempt: 2, now: '2026-11-14T05:00:00Z' })
    ),
    proofs: [
      { complete: true, run: run(100, 2), jobs: jobs(100, 2, 'failure') },
    ],
  };
  expect(first.ledger.attempts[0].status).toBe('pending');
  expect(second.ledger.attempts).toHaveLength(1);
  expect(
    evaluateProbeAdmission(context(), history(first, second))
  ).toMatchObject({ decision: 'defer-failures', failureCount: 2 });
  expect(first.ledger.attempts[0].status).toBe('pending');
});

it('reserves before probing and treats an unfinished reservation as unknown', () => {
  const first = artifact();
  first.ledger = reserveProbeAttempt(
    context({ runId: 100, now: '2026-11-14T04:00:00Z' })
  );
  first.proofs[0].run.status = 'in_progress';
  expect(validateProbeReservation(context({ runId: 100 }), first)).toBe(true);
  expect(first.ledger.attempts[0]).toMatchObject({
    status: 'pending',
    jobsDigest: null,
    authActualStatus: 'unknown',
  });
  expect(evaluateProbeAdmission(context(), history(first))).toMatchObject({
    decision: 'defer-unknown',
    admitted: false,
  });
  const final = recordProbeAttempt(context({ runId: 100 }), jobs(100, 1));
  expect(final.attempts).toHaveLength(1);
  expect(final.attempts[0].status).toBe('passed');
});

it('requires canonical producer proof before a current reservation can be finalized', () => {
  const first = artifact();
  first.ledger = reserveProbeAttempt(
    context({ runId: 100, now: '2026-11-14T04:00:00Z' })
  );
  first.proofs[0].run.path = '.github/workflows/other.yml';
  expect(validateProbeReservation(context({ runId: 100 }), first)).toBe(false);
  expect(validateProbeReservation(context(), first)).toBe(false);
});

it('binds the current reservation source and invocation to the current context', () => {
  const first = artifact();
  expect(
    validateProbeReservation(
      context({ runId: 100, workflowSha: 'd'.repeat(40) }),
      first
    )
  ).toBe(false);
  expect(
    validateProbeReservation(context({ runId: 100, mode: 'manual' }), first)
  ).toBe(false);
});

it('can recover from an older pending attempt only with a newer real pass', () => {
  const pending = artifact();
  pending.ledger = reserveProbeAttempt(
    context({ runId: 100, now: '2026-11-14T04:00:00Z' })
  );
  const recovered = artifact(200);
  recovered.ledger.attempts[0].mode = 'manual';
  recovered.proofs[0].run.event = 'workflow_dispatch';
  expect(
    evaluateProbeAdmission(context(), history(pending, recovered)).decision
  ).toBe('reuse-passed');
});

it('binds every job to the workflow producer head and main branch, not the landed SHA', () => {
  for (const field of ['head_sha', 'head_branch']) {
    const evidence = jobs(100, 1);
    evidence.jobs[0][field] = field === 'head_sha' ? 'd'.repeat(40) : 'feature';
    expect(() => recordProbeAttempt(context({ runId: 100 }), evidence)).toThrow(
      'Complete exact-attempt'
    );
    const first = artifact();
    first.proofs[0].jobs = evidence;
    expect(evaluateProbeAdmission(context(), history(first)).decision).toBe(
      'defer-unknown'
    );
  }
  const first = artifact();
  first.proofs[0].run.head_sha = '';
  expect(evaluateProbeAdmission(context(), history(first)).decision).toBe(
    'defer-unknown'
  );
});

it('rejects duplicate, current and conflicting producer evidence', () => {
  const first = artifact();
  expect(
    evaluateProbeAdmission(context(), history(first, first)).decision
  ).toBe('defer-unknown');
  expect(
    evaluateProbeAdmission(context({ runId: 100 }), history(first)).decision
  ).toBe('defer-unknown');
  first.proofs[0].run.head_repository.full_name = 'foreign/repository';
  expect(evaluateProbeAdmission(context(), history(first)).decision).toBe(
    'defer-unknown'
  );
});

it('reuses a recent actual pass despite a different workflow head and failed workflow', () => {
  expect(evaluateProbeAdmission(context(), history(artifact()))).toMatchObject({
    decision: 'reuse-passed',
    admitted: false,
  });
});

it('admits one retry, then defers after two actual failures without a time reset', () => {
  expect(
    evaluateProbeAdmission(context(), history(artifact(100, 'failure')))
  ).toMatchObject({
    decision: 'admit-retry',
    admitted: true,
    failureCount: 1,
  });
  expect(
    evaluateProbeAdmission(
      context({ now: '2027-01-01T00:00:00Z' }),
      history(artifact(100, 'failure'), artifact(200, 'failure'))
    )
  ).toMatchObject({
    decision: 'defer-failures',
    admitted: false,
    failureCount: 2,
  });
});

it('refreshes a pass older than twelve hours but never borrows an older pass after failure', () => {
  expect(
    evaluateProbeAdmission(
      context({ now: '2026-11-15T06:30:00Z' }),
      history(artifact())
    )
  ).toMatchObject({ decision: 'admit-refresh', admitted: true });
  expect(
    evaluateProbeAdmission(
      context(),
      history(artifact(), artifact(200, 'failure'))
    )
  ).toMatchObject({ decision: 'admit-retry', admitted: true });
});

it.each(['manual', 'clock'])(
  'keeps %s independent of missing history',
  mode => {
    expect(evaluateProbeAdmission(context({ mode }), null)).toMatchObject({
      decision: mode === 'manual' ? 'manual-override' : 'clock-bypass',
      admitted: mode === 'manual',
    });
  }
);

it.each([
  ['missing', null],
  ['empty truncated', { ...history(), complete: false }],
  ['truncated', { ...history(artifact()), complete: false }],
  ['wrong count', { ...history(artifact()), total_count: 2 }],
  ['expired', history({ ...artifact(), expired: true })],
  ['missing ledger', history({ ...artifact(), ledger: null })],
])(
  'defers %s history without inventing a pass or fresh budget',
  (_name, evidence) => {
    expect(evaluateProbeAdmission(context(), evidence)).toMatchObject({
      decision: 'defer-unknown',
      admitted: false,
    });
  }
);

it('keeps quota deferral distinct from a production failure', () => {
  expect(
    evaluateProbeAdmission(context(), { quotaDeferred: true })
  ).toMatchObject({ decision: 'quota-deferred', admitted: false });
});

it.each(['repository', 'path', 'head_branch', 'run_attempt'])(
  'rejects coherent foreign or wrong-attempt producer %s',
  field => {
    const proof = artifact();
    if (field === 'repository')
      proof.proofs[0].run.repository.full_name = 'other/repository';
    else proof.proofs[0].run[field] = field === 'run_attempt' ? 2 : 'other';
    expect(evaluateProbeAdmission(context(), history(proof)).admitted).toBe(
      false
    );
    expect(evaluateProbeAdmission(context(), history(proof)).decision).toBe(
      'defer-unknown'
    );
  }
);

it('does not accept target mismatch, skipped auth, or incomplete job pagination as proof', () => {
  const wrongTarget = artifact();
  wrongTarget.ledger.target.sha = 'd'.repeat(40);
  const skipped = artifact();
  skipped.proofs[0].jobs.jobs[1].steps[0].conclusion = 'skipped';
  const partial = artifact();
  partial.proofs[0].jobs.total_count = 4;
  for (const proof of [wrongTarget, skipped, partial])
    expect(evaluateProbeAdmission(context(), history(proof)).decision).toBe(
      'defer-unknown'
    );
});

it('records all-skipped or success-with-skipped-auth as incomplete', () => {
  const evidence = jobs(100, 1);
  evidence.jobs[1].steps[0].conclusion = 'skipped';
  expect(
    recordProbeAttempt(context({ runId: 100 }), evidence).attempts[0].status
  ).toBe('incomplete');
  evidence.jobs.forEach(job => {
    job.conclusion = 'skipped';
  });
  expect(
    recordProbeAttempt(context({ runId: 100 }), evidence).attempts[0].status
  ).toBe('incomplete');
});

it('lets a newer real manual recovery replace failure backoff', () => {
  const recovered = artifact(200);
  recovered.ledger.attempts[0].mode = 'manual';
  recovered.proofs[0].run.event = 'workflow_dispatch';
  expect(
    evaluateProbeAdmission(
      context(),
      history(artifact(100, 'failure'), recovered)
    ).decision
  ).toBe('reuse-passed');
});
