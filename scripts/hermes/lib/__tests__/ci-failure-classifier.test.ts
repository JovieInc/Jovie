import { describe, expect, it } from 'vitest';
import {
  classifyCiFailure,
  classifyKnownCiFlake,
} from '../ci-failure-classifier';

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
