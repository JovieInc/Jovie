import { describe, expect, it } from 'vitest';
import { sweepOutcomes } from '../outcome-sweep.mjs';
import { readSweepJobs } from '../outcome-sweep-proof.mjs';

const NOW = Date.parse('2026-11-22T10:00:00Z');
const run = (id, file, conclusion, extra = {}) => ({
  id,
  path: `.github/workflows/${file}@refs/heads/main`,
  conclusion,
  head_branch: 'main',
  event: 'schedule',
  created_at: new Date(NOW - id * 60_000).toISOString(),
  html_url: `https://github.com/o/r/actions/runs/${id}`,
  head_sha: 'a'.repeat(40),
  run_attempt: 1,
  run_number: id,
  ...extra,
});

describe('exact attempt recovery in the hosted sweep', () => {
  const file = 'fleet-gate-refresh.yml';
  const env = {
    GITHUB_REPOSITORY: 'o/r',
    GH_TOKEN: 'fixture',
    LINEAR_API_KEY: 'fixture',
  };
  const makeRun = (id, result, event = 'workflow_run') =>
    run(id, file, result, {
      created_at: new Date(NOW + id * 60_000).toISOString(),
      event,
    });
  const job = (run, name, conclusion) => ({
    run_id: run.id,
    head_sha: run.head_sha,
    status: 'completed',
    name,
    conclusion,
  });

  function fixture() {
    let issue = null;
    const linear = [];
    const github = [];
    let runs = [];
    let inventories = new Map();
    const reply = data => new Response(JSON.stringify(data));
    const fetchImpl = async (raw, request) => {
      const url = new URL(raw);
      if (url.pathname.startsWith('/repos/')) {
        github.push(url.pathname + url.search);
        if (url.pathname.endsWith('/jobs')) {
          const id = Number(url.pathname.split('/').at(-4));
          const jobs = inventories.get(id);
          return jobs
            ? reply({ jobs, total_count: jobs.length })
            : new Response('{}', { status: 502 });
        }
        const page = Number(url.searchParams.get('page'));
        const rows = runs instanceof Map ? (runs.get(page) ?? []) : runs;
        return reply({ workflow_runs: rows });
      }
      const { query, variables } = JSON.parse(String(request.body));
      linear.push(query);
      const team = {
        states: {
          nodes: [
            { id: 'open', name: 'Backlog', type: 'backlog' },
            { id: 'done', name: 'Done', type: 'completed' },
          ],
        },
      };
      if (query.includes('FindTeamLabel')) return reply({ data: { team } });
      if (
        query.includes('FindIssueByFingerprint') ||
        query.includes('FindRemediationForGreen')
      ) {
        return reply({
          data: { team, issues: { nodes: issue ? [issue] : [] } },
        });
      }
      if (query.includes('issueCreate')) {
        issue = {
          id: 'issue',
          title: variables.title,
          description: variables.description,
          state: { id: 'open', type: 'started' },
          identifier: 'JOV-1',
          url: 'https://example.invalid/issue',
        };
        return reply({ data: { issueCreate: { success: true, issue } } });
      }
      if (query.includes('commentCreate'))
        return reply({
          data: {
            commentCreate: {
              success: true,
              comment: { id: 'comment' },
            },
          },
        });
      if (query.includes('UpdateDedupedLinearIssue')) {
        issue.description = variables.input.description;
        issue.state = { id: variables.input.stateId, type: 'started' };
        return reply({ data: { issueUpdate: { success: true, issue } } });
      }
      if (query.includes('ResolveRemediation')) {
        issue.state = { id: variables.stateId, type: 'completed' };
        return reply({ data: { issueUpdate: { success: true, issue } } });
      }
      throw new Error('unexpected fixture request');
    };
    return {
      github,
      linear,
      async sweep(previous, nextRuns, jobs, at) {
        runs = nextRuns;
        inventories = jobs;
        return sweepOutcomes({
          root: process.cwd(),
          previous,
          env,
          fetchImpl,
          nowMs: NOW + at,
        });
      },
    };
  }

  it.each([
    [
      'fleet-gate-refresh.yml',
      'Assess exact Linear Triage event',
      'Refresh persisted fleet gate receipt',
      'repository_dispatch',
      'workflow_run',
    ],
    [
      'mutation-diff.yml',
      'Rolling mutation sweep',
      'Mutate changed high-risk source',
      'schedule',
      'push',
    ],
    [
      'main-health.yml',
      'Main health (script contracts, idle probe)',
      'Main health (census and certification)',
      'workflow_dispatch',
      'workflow_run',
    ],
    [
      'merge-queue-green-enroll.yml',
      'Hold failed source revision',
      'Enqueue green PRs',
      'workflow_run',
      'push',
    ],
  ])(
    'holds and resolves only matching jobs for %s',
    async (workflow, failing, sibling, event, siblingEvent) => {
      const f = fixture();
      const observed = (id, result, trigger) =>
        run(id, workflow, result, {
          created_at: new Date(NOW + id * 60_000).toISOString(),
          event: trigger,
        });
      const red = observed(1, 'failure', event);
      const refresh = observed(2, 'success', siblingEvent);
      const recovered = observed(3, 'success', event);
      let state = await f.sweep(
        {},
        [red],
        new Map([
          [1, [job(red, failing, 'failure'), job(red, sibling, 'skipped')]],
        ]),
        60_000
      );
      expect(state[workflow].linearBinding).toContain(
        'workflow-outcome-red:1:1:'
      );
      expect(state[workflow].state).toBe('red');
      expect(f.linear.some(query => query.includes('issueCreate'))).toBe(true);

      state = await f.sweep(
        state,
        [refresh, red],
        new Map([
          [
            2,
            [
              job(refresh, sibling, 'success'),
              job(refresh, failing, 'skipped'),
            ],
          ],
        ]),
        120_000
      );
      expect(state[workflow].state).toBe('red');
      expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
        false
      );

      state = await f.sweep(
        state,
        [recovered, refresh, red],
        new Map([
          [
            3,
            [
              job(recovered, sibling, 'skipped'),
              job(recovered, failing, 'success'),
            ],
          ],
        ]),
        180_000
      );
      expect(state[workflow].state).toBe('green');
      expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
        true
      );
      expect(f.github.filter(url => url.includes('/jobs'))).toEqual(
        [1, 2, 3].map(
          id =>
            `/repos/o/r/actions/runs/${id}/attempts/1/jobs?per_page=100&page=1`
        )
      );
    }
  );

  it('backfills the original episode through an outage before accepting green', async () => {
    const f = fixture();
    const first = makeRun(1, 'failure');
    const hidden = makeRun(50, 'failure');
    const green = makeRun(100, 'success');
    let state = await f.sweep(
      {},
      [first],
      new Map([[1, [job(first, 'A', 'failure')]]]),
      60_000
    );
    const filler = Array.from({ length: 99 }, (_, index) =>
      run(200 + index, 'other.yml', 'success', {
        created_at: new Date(
          NOW + (99 - (index * 31) / 98) * 60_000
        ).toISOString(),
      })
    );
    state = await f.sweep(
      state,
      new Map([
        [1, [green, ...filler]],
        [2, [hidden, first]],
      ]),
      new Map([
        [50, [job(hidden, 'B', 'failure')]],
        [100, [job(green, 'A', 'success')]],
      ]),
      100 * 60_000
    );
    expect(f.github.some(url => url.endsWith('page=2'))).toBe(true);
    expect(state[file].inventoryGap).toBe(false);
    expect(state[file].state).toBe('red');
    expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
      false
    );
  });

  it('holds a capped episode even after a later complete page and matching green', async () => {
    const f = fixture();
    const first = makeRun(1, 'failure');
    const green = makeRun(102, 'success');
    let state = await f.sweep(
      {},
      [first],
      new Map([[1, [job(first, 'A', 'failure')]]]),
      60_000
    );
    const pages = new Map(
      Array.from({ length: 5 }, (_, page) => [
        page + 1,
        Array.from({ length: 100 }, (_, index) =>
          run(300 + page * 100 + index, 'other.yml', 'success', {
            created_at: new Date(NOW + 90 * 60_000).toISOString(),
          })
        ),
      ])
    );
    const before = f.github.length;
    state = await f.sweep(state, pages, new Map(), 100 * 60_000);
    expect(f.github.length - before).toBe(5);
    expect(state[file].inventoryGap).toBe(true);
    state = await f.sweep(
      state,
      [green],
      new Map([[102, [job(green, 'A', 'success')]]]),
      102 * 60_000
    );
    expect(state[file].inventoryGap).toBe(true);
    expect(state[file].state).toBe('red');
    expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
      false
    );
  });

  it('keeps a new episode scoped when the same Linear issue is reopened', async () => {
    const f = fixture();
    const red = makeRun(1, 'failure');
    const recovered = makeRun(2, 'success');
    const recurrence = makeRun(3, 'failure');
    let state = await f.sweep(
      {},
      [red],
      new Map([[1, [job(red, 'A', 'failure')]]]),
      60_000
    );
    state = await f.sweep(
      state,
      [recovered],
      new Map([[2, [job(recovered, 'A', 'success')]]]),
      120_000
    );
    expect(state[file].state).toBe('green');
    state = await f.sweep(
      state,
      [recurrence],
      new Map([[3, [job(recurrence, 'A', 'failure')]]]),
      180_000
    );
    expect(state[file].state).toBe('red');
    expect(state[file].legacyRed).toBe(false);
    expect(
      f.linear.filter(query => query.includes('issueCreate'))
    ).toHaveLength(1);
    expect(
      f.linear.some(query => query.includes('UpdateDedupedLinearIssue'))
    ).toBe(true);
  });

  it('does not reopen a discharged red that reappears after the wrapper cursor advanced', async () => {
    const f = fixture();
    const red = makeRun(1, 'failure', 'repository_dispatch');
    const recovered = makeRun(2, 'success', 'repository_dispatch');
    const quiet = makeRun(3, 'success', 'workflow_run');
    let state = await f.sweep(
      {},
      [red],
      new Map([[1, [job(red, 'Assess event', 'failure')]]]),
      60_000
    );
    state = await f.sweep(
      state,
      [recovered],
      new Map([[2, [job(recovered, 'Assess event', 'success')]]]),
      120_000
    );
    expect(state[file].state).toBe('green');
    state = await f.sweep(state, [quiet], new Map(), 180_000);
    expect(state[file].runId).toBe(3);
    const linearCalls = f.linear.length;
    state = await f.sweep(state, [quiet, red], new Map(), 181_000);
    expect(state[file].state).toBe('green');
    expect(f.linear).toHaveLength(linearCalls);
  });

  it('retains a first-seen red even when a disjoint green is newer in the same inventory page', async () => {
    const f = fixture();
    const red = makeRun(1, 'failure', 'repository_dispatch');
    const green = makeRun(2, 'success', 'workflow_run');
    const state = await f.sweep(
      {},
      [green, red],
      new Map([
        [1, [job(red, 'Assess event', 'failure')]],
        [2, [job(green, 'Refresh receipt', 'success')]],
      ]),
      120_000
    );
    expect(state[file].state).toBe('red');
    expect(f.linear.some(query => query.includes('issueCreate'))).toBe(true);
    expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
      false
    );
  });

  it('does not clear a distinct trigger scope with the same display name', async () => {
    const f = fixture();
    const red = makeRun(1, 'failure', 'repository_dispatch');
    const unrelated = makeRun(2, 'success', 'workflow_run');
    let state = await f.sweep(
      {},
      [red],
      new Map([[1, [job(red, 'Same name', 'failure')]]]),
      60_000
    );
    state = await f.sweep(
      state,
      [unrelated, red],
      new Map([[2, [job(unrelated, 'Same name', 'success')]]]),
      120_000
    );
    expect(state[file].state).toBe('red');
    expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
      false
    );
  });

  it('cannot recover a saved incident from a first-seen green wrapper after state loss', async () => {
    const f = fixture();
    const green = makeRun(3, 'success', 'repository_dispatch');
    const state = await f.sweep(null, [green], new Map(), 180_000);
    expect(state[file].state).toBe('unknown');
    expect(f.linear).toEqual([]);
    expect(f.github.some(url => url.includes('/jobs'))).toBe(false);
  });

  it('retains unread exact attempt evidence and spends no more than the existing read allowance', async () => {
    const f = fixture();
    const red = makeRun(1, 'failure', 'repository_dispatch');
    const state = await f.sweep({}, [red], new Map(), 60_000);
    expect(state[file].state).toBe('red');
    expect(state[file].pending).toHaveLength(1);
    expect(state[file].holdReason).toBe('http-502');
    expect(f.github).toHaveLength(2);
    expect(f.linear.some(query => query.includes('ResolveRemediation'))).toBe(
      false
    );
  });

  it('uses no job reads when five inventory pages consume the whole allowance', async () => {
    const f = fixture();
    const red = makeRun(1, 'failure');
    const state = await f.sweep({}, Array(100).fill(red), new Map(), 60_000);
    expect(f.github).toHaveLength(5);
    expect(f.github.some(url => url.includes('/jobs'))).toBe(false);
    expect(state[file].state).toBe('red');
    expect(state[file].pending).toHaveLength(1);
    expect(state[file].holdReason).toBe('attempt_job_read_budget_deferred');
  });

  it('holds on duplicate display names and mismatched job identities', async () => {
    const current = makeRun(1, 'success');
    const identity = { id: '1', number: 1, attempt: 1, sha: current.head_sha };
    for (const [jobs, expected] of [
      [
        [job(current, 'Matrix', 'success'), job(current, 'Matrix', 'success')],
        'duplicate_attempt_job_name',
      ],
      [
        [{ ...job(current, 'Matrix', 'success'), run_id: 9 }],
        'attempt_job_identity_mismatch',
      ],
      [
        [{ ...job(current, 'Matrix', 'success'), run_attempt: 2 }],
        'attempt_job_identity_mismatch',
      ],
    ]) {
      const result = await readSweepJobs({
        file,
        repo: 'o/r',
        token: 'fixture',
        identity,
        event: 'workflow_run',
        nowMs: NOW,
        fetchImpl: async () =>
          new Response(JSON.stringify({ jobs, total_count: jobs.length })),
      });
      expect(result).toEqual({ ok: false, reason: expected });
    }
  });
});
