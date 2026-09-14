import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  decideFounderAlert,
  executeGhApi,
  runCli,
} from './production-continuity-dedupe.mjs';

const NOW = new Date('2026-09-13T18:00:00.000Z');
const INCIDENT_KEY =
  'production-continuity:summer-production:deployment-paused';
const REPOSITORY = 'JovieInc/Jovie';

const jobPayload = ({
  incidentKey = INCIDENT_KEY,
  conclusion = 'success',
} = {}) =>
  JSON.stringify({
    jobs: [
      {
        name: `Notify production on-call (${incidentKey})`,
        steps: [{ name: 'Deliver immediate founder alert', conclusion }],
      },
    ],
  });

describe('production continuity alert dedupe', () => {
  it('invokes the bounded real GitHub CLI transport', async () => {
    const calls = [];
    const result = await executeGhApi('repos/JovieInc/Jovie/actions/runs', {
      execFileImpl: async (...args) => {
        calls.push(args);
        return { stdout: '{"workflow_runs":[]}' };
      },
    });
    assert.equal(result, '{"workflow_runs":[]}');
    assert.equal(calls[0][0], 'gh');
    assert.deepEqual(calls[0][1], ['api', 'repos/JovieInc/Jovie/actions/runs']);
    assert.equal(calls[0][2].maxBuffer, 4 * 1024 * 1024);
  });

  it('suppresses only an exact recent successful transport receipt', async () => {
    const result = await decideFounderAlert({
      ghApi: async endpoint =>
        endpoint.includes('/jobs?')
          ? jobPayload()
          : JSON.stringify({
              workflow_runs: [
                { id: 123, created_at: '2026-09-13T17:45:00.000Z' },
              ],
            }),
      incidentKey: INCIDENT_KEY,
      now: NOW,
      repository: REPOSITORY,
    });
    assert.deepEqual(result, {
      shouldNotify: false,
      reason: 'recent-transport-receipt',
    });
  });

  it('notifies for a different incident or failed delivery', async () => {
    for (const jobs of [
      jobPayload({
        incidentKey: 'production-continuity:jovie-production:http-500',
      }),
      jobPayload({ conclusion: 'failure' }),
    ]) {
      const result = await decideFounderAlert({
        ghApi: async endpoint =>
          endpoint.includes('/jobs?')
            ? jobs
            : JSON.stringify({
                workflow_runs: [
                  { id: 123, created_at: '2026-09-13T17:45:00.000Z' },
                ],
              }),
        incidentKey: INCIDENT_KEY,
        now: NOW,
        repository: REPOSITORY,
      });
      assert.equal(result.shouldNotify, true);
      assert.equal(result.reason, 'no-recent-transport-receipt');
    }
  });

  it('notifies with empty or expired history', async () => {
    for (const workflowRuns of [
      [],
      [{ id: 123, created_at: '2026-09-13T17:29:59.000Z' }],
    ]) {
      const result = await decideFounderAlert({
        ghApi: async () => JSON.stringify({ workflow_runs: workflowRuns }),
        incidentKey: INCIDENT_KEY,
        now: NOW,
        repository: REPOSITORY,
      });
      assert.equal(result.shouldNotify, true);
    }
  });

  it('fails open when GitHub history is unavailable or malformed', async () => {
    for (const ghApi of [
      async () => {
        throw new Error('GitHub unavailable');
      },
      async () => '{"unexpected":[]}',
    ]) {
      const result = await decideFounderAlert({
        ghApi,
        incidentKey: INCIDENT_KEY,
        now: NOW,
        repository: REPOSITORY,
      });
      assert.equal(result.shouldNotify, true);
      assert.equal(result.reason, 'history-unavailable-fail-open');
    }
  });

  it('rejects missing identity inputs before consulting history', async () => {
    await assert.rejects(
      decideFounderAlert({ ghApi: async () => '{}', repository: REPOSITORY }),
      /incident key and repository/
    );
  });

  it('writes the workflow output for the executable CLI path', async () => {
    const appends = [];
    const result = await runCli({
      appendFileImpl: async (...args) => appends.push(args),
      env: {
        GITHUB_OUTPUT: '/tmp/github-output',
        INCIDENT_KEY,
        REPOSITORY,
      },
      ghApi: async () => JSON.stringify({ workflow_runs: [] }),
      now: NOW,
      stdout: { write() {} },
    });
    assert.equal(result.shouldNotify, true);
    assert.match(appends[0][1], /should_notify=true/);
    assert.match(appends[0][1], /dedupe_reason=no-recent-transport-receipt/);
  });

  it('surfaces fail-open history warnings and still writes notify=true', async () => {
    const appends = [];
    const stdout = [];
    const result = await runCli({
      appendFileImpl: async (...args) => appends.push(args),
      env: {
        GITHUB_OUTPUT: '/tmp/github-output',
        INCIDENT_KEY,
        REPOSITORY,
      },
      ghApi: async () => '{"unexpected":[]}',
      now: NOW,
      stdout: { write: value => stdout.push(value) },
    });
    assert.equal(result.shouldNotify, true);
    assert.match(appends[0][1], /should_notify=true/);
    assert.match(stdout[0], /::warning::Alert history unavailable/);
  });

  it('requires the GitHub output destination', async () => {
    await assert.rejects(
      runCli({
        env: { INCIDENT_KEY, REPOSITORY },
        ghApi: async () => JSON.stringify({ workflow_runs: [] }),
        now: NOW,
        stdout: { write() {} },
      }),
      /requires GITHUB_OUTPUT/
    );
  });
});
