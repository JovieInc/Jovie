import { describe, expect, it } from 'vitest';

import {
  SONAR_CHECK_APP_SLUG,
  SONAR_CHECK_NAME,
  selectLatestFailingSonarCheck,
} from '../sonar-check-selection.mjs';

function sonarCheck(overrides = {}) {
  return {
    id: 1,
    name: SONAR_CHECK_NAME,
    app: { slug: SONAR_CHECK_APP_SLUG },
    status: 'completed',
    conclusion: 'failure',
    details_url: 'https://sonarcloud.io/project/pull_requests?id=jovie',
    completed_at: '2026-08-20T01:00:00Z',
    ...overrides,
  };
}

describe('trusted Sonar check selection', () => {
  it('selects only the newest authenticated failing SonarCloud check', () => {
    const newest = sonarCheck({
      id: 4,
      completed_at: '2026-08-20T04:00:00Z',
    });
    expect(
      selectLatestFailingSonarCheck([
        {
          check_runs: [
            sonarCheck({ id: 2, app: { slug: 'attacker' } }),
            sonarCheck({ id: 3, details_url: 'https://attacker.example/' }),
            newest,
          ],
        },
      ])
    ).toEqual(newest);
  });

  it('does not route a stale failure while a newer trusted check is running or green', () => {
    const staleFailure = sonarCheck();
    expect(
      selectLatestFailingSonarCheck([
        {
          check_runs: [
            staleFailure,
            sonarCheck({
              id: 2,
              status: 'in_progress',
              conclusion: null,
              started_at: '2026-08-20T02:00:00Z',
              completed_at: null,
            }),
          ],
        },
      ])
    ).toBeNull();
    expect(
      selectLatestFailingSonarCheck([
        {
          check_runs: [
            staleFailure,
            sonarCheck({
              id: 3,
              conclusion: 'success',
              completed_at: '2026-08-20T03:00:00Z',
            }),
          ],
        },
      ])
    ).toBeNull();
  });
});
