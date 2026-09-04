import { describe, expect, it } from 'vitest';
import {
  classifyCiFailure,
  classifyGithubConcurrencyPendingReplacement,
  classifyKnownCiFlake,
} from '../ci-failure-classifier';

describe('github_concurrency_pending_replacement', () => {
  const observed = {
    pending: {
      id: 87297130629,
      status: 'cancelled',
      createdAt: '2026-07-15T07:45:35Z',
      cancelledAt: '2026-07-15T07:47:02Z',
      startedAt: null,
      runnerName: '',
      steps: [],
      headSha: 'a'.repeat(40),
    },
    replacement: {
      id: 87297400000,
      status: 'queued',
      createdAt: '2026-07-15T07:47:02Z',
      headSha: 'b'.repeat(40),
    },
  } as const;

  it('matches the exact unassigned replacement timeline', () => {
    expect(classifyGithubConcurrencyPendingReplacement(observed)).toMatchObject(
      {
        id: 'github_concurrency_pending_replacement',
        classification: 'missing-automation',
        retryable: false,
      }
    );
  });

  it.each([
    { runnerName: 'runner-1' },
    { steps: [{}] },
    { startedAt: '2026-07-15T07:46:00Z' },
  ])('rejects jobs that obtained execution: %o', patch =>
    expect(
      classifyGithubConcurrencyPendingReplacement({
        ...observed,
        pending: { ...observed.pending, ...patch },
      })
    ).toBeNull());

  it('rejects an unrelated later job', () => {
    expect(
      classifyGithubConcurrencyPendingReplacement({
        ...observed,
        replacement: {
          ...observed.replacement,
          createdAt: '2026-07-15T08:01:00Z',
        },
      })
    ).toBeNull();
  });
});

describe('classifyCiFailure', () => {
  it.each([
    'user_test',
    'ba_dev_creator-ready',
  ])('classifies Postgres 22P02 for synthetic actor %s as a non-retryable broken fixture', actor => {
    const diagnosis = classifyCiFailure(
      `PostgresError: invalid input syntax for type uuid: "${actor}" code: 22P02`
    );

    expect(diagnosis).toMatchObject({
      id: 'postgres-synthetic-auth-actor-uuid',
      classification: 'broken-e2e-fixture',
      retryable: false,
    });
    expect(diagnosis?.remediation).toContain('POST /api/dev/test-auth/session');
  });

  it('does not classify an unrelated 22P02 as an auth fixture failure', () => {
    expect(
      classifyCiFailure(
        'invalid input syntax for type uuid: "not-an-auth-label" code 22P02'
      )
    ).toBeNull();
  });

  it('does not classify a synthetic actor label without a UUID error', () => {
    expect(classifyCiFailure('user_test navigation timed out')).toBeNull();
  });

  it('does not correlate an unrelated UUID error with a synthetic actor elsewhere in the log', () => {
    expect(
      classifyCiFailure(`
        config: E2E_CLERK_USER_ID=user_test
        PostgresError: invalid input syntax for type uuid: "unrelated-value" code: 22P02
      `)
    ).toBeNull();
  });

  it('preserves known-flake precedence when separated signals are not a fixture diagnosis', () => {
    const log = `
      config: E2E_CLERK_USER_ID=user_test
      PostgresError: invalid input syntax for type uuid: "unrelated-value" code: 22P02
      socket hang up
    `;

    expect(
      classifyKnownCiFlake(log, 'CI', [
        {
          id: 'transient-socket-reset',
          workflow: 'CI',
          pattern: 'socket hang up',
          note: 'Transient network failure',
        },
      ])
    ).toMatchObject({ id: 'transient-socket-reset' });
  });

  it('keeps a correlated fixture diagnosis ahead of a coincident known flake', () => {
    const log = `
      PostgresError: invalid input syntax for type uuid: "user_test" code: 22P02
      socket hang up
    `;

    expect(
      classifyKnownCiFlake(log, 'CI', [
        {
          id: 'transient-socket-reset',
          workflow: 'CI',
          pattern: 'socket hang up',
          note: 'Transient network failure',
        },
      ])
    ).toBeNull();
  });

  it('classifies the Better Auth insert log even when the database driver hides 22P02', () => {
    const diagnosis =
      classifyCiFailure(`Failed query: insert into "ba_users" ("id", "name", "email") values ($1, $2, $3)
params: ba_dev_browse_ready_clerk_test_jov_ie,Browse Ready,browse-ready+clerk_test@jov.ie`);

    expect(diagnosis).toMatchObject({
      id: 'postgres-synthetic-auth-actor-uuid',
      classification: 'broken-e2e-fixture',
      retryable: false,
    });
    expect(diagnosis?.rootCause).toContain('UUID-backed ba_users.id');
  });

  it('keeps the persisted-auth diagnosis when runner-pressure signatures coexist', () => {
    const diagnosis = classifyCiFailure(`
      PostgresError: invalid input syntax for type uuid: "ba_dev_creator-ready" code: 22P02
      ERR_WORKER_INIT_FAILED: spawnSync node EAGAIN
      PSI: sustained I/O pressure on runner
    `);

    expect(diagnosis).toMatchObject({
      id: 'postgres-synthetic-auth-actor-uuid',
      classification: 'broken-e2e-fixture',
      retryable: false,
    });
  });

  it('does not classify an unrelated Better Auth insert failure', () => {
    expect(
      classifyCiFailure(
        'Failed query: insert into "ba_users" ("id") values ($1) params: 23b56d74-cbf1-85e9-bf12-91c67b538ecc'
      )
    ).toBeNull();
  });

  it('does not correlate a valid Better Auth insert with legacy params from another record', () => {
    expect(
      classifyCiFailure(`Failed query: insert into "ba_users" ("id") values ($1)
params: 23b56d74-cbf1-85e9-bf12-91c67b538ecc
unrelated diagnostic params: ba_dev_creator-ready`)
    ).toBeNull();
  });
});
