import { describe, expect, it, vi } from 'vitest';
import {
  applyRemediationDecision,
  gateSteadyGreen,
} from '../remediation-signal.mjs';
import {
  acknowledgedWorkflowScope,
  matchesWorkflowRedBinding,
  workflowOutcomeProof,
  workflowRedBinding,
} from '../workflow-outcome-proof.mjs';

function run(number, attempt = 1) {
  return {
    id: String(45945686600 + number),
    number,
    attempt,
    sha: number.toString(16).padStart(40, 'b'),
  };
}

/**
 * @param {{
 *   previous?: string | ReturnType<typeof workflowOutcomeProof>,
 *   jobs?: Record<string, string>,
 *   number: number,
 *   attempt?: number,
 *   conclusion?: string,
 *   source?: string,
 *   job?: string
 * }} options
 */
function report({ previous, jobs, number, attempt, conclusion, source, job }) {
  return workflowOutcomeProof({
    cached:
      typeof previous === 'string'
        ? previous
        : (JSON.stringify(previous?.state) ?? ''),
    source: source ?? 'ci-duration-ratchet.yml',
    results:
      jobs === undefined
        ? ''
        : JSON.stringify(
            Object.fromEntries(
              Object.entries(jobs).map(([id, result]) => [id, { result }])
            )
          ),
    conclusion:
      conclusion ??
      (Object.values(jobs ?? {}).includes('failure') ? 'failure' : 'success'),
    identity: run(number, attempt),
    job,
  });
}

describe('workflow outcome recovery proof', () => {
  it('keeps the actual fan-out repair open after an unrelated green push', () => {
    const red = report({
      number: 1,
      jobs: {
        'dev-loop': 'success',
        measure: 'success',
        'fan-out-budget': 'failure',
      },
    });
    const push = report({
      previous: red,
      number: 2,
      jobs: {
        'dev-loop': 'success',
        measure: 'skipped',
        'fan-out-budget': 'skipped',
      },
    });
    expect(push).toMatchObject({
      action: 'hold',
      reason: 'failed_workflow_probes_pending:fan-out-budget',
      state: { status: 'red', unresolved: { 'fan-out-budget': run(1) } },
    });
    const green = report({
      previous: push,
      number: 3,
      jobs: {
        'dev-loop': 'success',
        measure: 'success',
        'fan-out-budget': 'success',
      },
    });
    expect(green.action).toBe('green');
    expect(green.state.unresolved).toEqual({});
    expect(green.state.verified['fan-out-budget']).toEqual({
      failure: run(1),
      success: run(3),
    });
  });

  it('keeps simultaneous incidents and qualifies their separate recovery schedules', () => {
    const source = 'synthetic-monitoring.yml';
    const dailyRed = report({
      source,
      number: 1,
      jobs: { 'billing-health-public': 'failure', 'synthetic-test': 'skipped' },
    });
    const sixHourRed = report({
      source,
      previous: dailyRed,
      number: 2,
      jobs: { 'billing-health-public': 'skipped', 'synthetic-test': 'failure' },
    });
    expect(Object.keys(sixHourRed.state.unresolved)).toEqual([
      'billing-health-public',
      'synthetic-test',
    ]);
    const frequentSuccess = report({
      source,
      previous: sixHourRed,
      number: 3,
      jobs: { 'billing-health-public': 'skipped', 'synthetic-test': 'success' },
    });
    expect(frequentSuccess.action).toBe('hold');
    expect(frequentSuccess.state.unresolved).toEqual({
      'billing-health-public': run(1),
    });
    const dailySuccess = report({
      source,
      previous: frequentSuccess,
      number: 4,
      jobs: { 'billing-health-public': 'success', 'synthetic-test': 'skipped' },
    });
    expect(dailySuccess.action).toBe('green');
    expect(dailySuccess.proof).toContain(
      `synthetic-test: run ${run(3).id}, attempt 1, workflow SHA ${run(3).sha}`
    );
    expect(dailySuccess.proof).toContain(
      `billing-health-public: run ${run(4).id}, attempt 1, workflow SHA ${run(4).sha}`
    );
  });

  it('does not discard an older run that completed later for a different probe', () => {
    const red = report({
      number: 3,
      jobs: { daily: 'failure', frequent: 'skipped' },
    });
    const laterObserved = report({
      previous: red,
      number: 2,
      jobs: { daily: 'skipped', frequent: 'failure' },
    });
    expect(laterObserved.action).toBe('red');
    expect(laterObserved.state.unresolved).toEqual({
      daily: run(3),
      frequent: run(2),
    });
    const partial = report({
      previous: laterObserved,
      number: 5,
      jobs: { daily: 'success', frequent: 'skipped' },
    });
    expect(partial.action).toBe('hold');
    const final = report({
      previous: partial,
      number: 4,
      jobs: { daily: 'skipped', frequent: 'success' },
    });
    expect(final.action).toBe('green');
  });

  it('holds legacy red even when every current job passes because the original scope is unknown', () => {
    for (const jobs of [{}, { a: 'skipped' }, { a: 'success', b: 'skipped' }]) {
      expect(report({ previous: 'red', number: 2, jobs }).action).toBe('hold');
    }
    const outcome = report({
      previous: 'red',
      number: 2,
      jobs: { a: 'success', b: 'success' },
    });
    expect(outcome).toMatchObject({
      action: 'hold',
      previous: 'red',
      reason: 'original_failed_probes_unknown',
    });
  });

  it('does not let a renamed failed probe or a missing cache clear the original red', () => {
    const red = report({ number: 1, jobs: { old: 'failure' } });
    const renamed = report({
      previous: red,
      number: 2,
      jobs: { replacement: 'success' },
    });
    expect(renamed.action).toBe('hold');
    expect(renamed.state.unresolved).toEqual({ old: run(1) });

    const missingCache = report({
      number: 2,
      jobs: { a: 'success', b: 'success' },
    });
    expect(gateSteadyGreen(missingCache, missingCache.previous, '1')).toEqual({
      action: 'skip',
      reason: 'steady_green',
    });
  });

  it('does not adopt an already-open incident after a lost scope cache', () => {
    const newRed = report({ number: 1, jobs: { frequent: 'failure' } });
    const existing = acknowledgedWorkflowScope(newRed, {
      ok: true,
      action: 'updated',
    });
    expect(existing.unknown).toBe(true);
    expect(
      report({
        previous: JSON.stringify(existing),
        number: 2,
        jobs: { frequent: 'success' },
      }).action
    ).toBe('hold');
    expect(acknowledgedWorkflowScope(newRed, undefined).unknown).toBe(true);
    expect(
      acknowledgedWorkflowScope(newRed, {
        ok: false,
        action: 'updated',
        reopened: true,
      }).unknown
    ).toBe(true);
    expect(
      acknowledgedWorkflowScope(newRed, {
        ok: true,
        action: 'updated',
        reopened: true,
      }).unknown
    ).toBe(false);
    const created = acknowledgedWorkflowScope(newRed, {
      ok: true,
      action: 'created',
    });
    expect(
      report({
        previous: JSON.stringify(created),
        number: 2,
        jobs: { frequent: 'success' },
      }).action
    ).toBe('green');
  });

  it('ignores a late red on a previously healthy probe and keeps a distinct late failure', () => {
    const pass = report({ number: 3, jobs: { a: 'success', b: 'skipped' } });
    expect(pass.state.successful).toEqual({ a: run(3) });
    expect(
      report({ previous: pass, number: 2, jobs: { a: 'failure' } })
    ).toMatchObject({
      action: 'hold',
      reason: 'stale_workflow_attempt',
    });
    const distinct = report({
      previous: pass,
      number: 2,
      jobs: { a: 'failure', b: 'failure' },
    });
    expect(distinct.state.unresolved).toEqual({ b: run(2) });
    expect(
      report({ previous: distinct, number: 3, jobs: { a: 'success' } }).action
    ).toBe('hold');
  });

  it('rejects a stale attempt before touching its prior evidence', () => {
    const red = report({ number: 2, jobs: { a: 'failure' } });
    expect(
      report({ previous: red, number: 1, jobs: { a: 'success' } }).action
    ).toBe('hold');
    expect(
      report({ previous: red, number: 2, jobs: { a: 'success' } }).action
    ).toBe('hold');
    expect(
      report({ previous: red, number: 2, attempt: 2, jobs: { a: 'success' } })
        .action
    ).toBe('green');
  });

  it('keeps explicit single-job reporting scoped to that job', () => {
    const source = 'automation-liveness.yml';
    const red = report({
      source,
      number: 1,
      conclusion: 'failure',
      job: 'liveness',
    });
    expect(red.state.unresolved).toEqual({ liveness: run(1) });
    expect(
      report({ source, previous: red, number: 2, job: 'installation-budget' })
        .action
    ).toBe('hold');
    expect(
      report({ source, previous: red, number: 3, job: 'liveness' }).action
    ).toBe('green');
  });

  it('disregards a green job whose required measurement did not qualify', () => {
    const red = report({ number: 1, jobs: { measure: 'failure' } });
    const result = workflowOutcomeProof({
      cached: JSON.stringify(red.state),
      identity: run(2),
      source: 'ci-duration-ratchet.yml',
      conclusion: 'success',
      results: JSON.stringify({
        measure: {
          result: 'success',
          outputs: { remediation_qualified: 'false' },
        },
      }),
    });
    expect(result).toMatchObject({
      action: 'hold',
      reason: 'workflow_probes_did_not_run',
    });
  });

  it('requires the current Linear issue to bind to the last observed red attempt', () => {
    const first = workflowRedBinding(run(1));
    const latest = workflowRedBinding(run(2));
    expect(matchesWorkflowRedBinding(`## Evidence\n\n${latest}\n`, first)).toBe(
      false
    );
    expect(
      matchesWorkflowRedBinding(`## Evidence\n\n${latest}\n`, latest)
    ).toBe(true);
    expect(
      matchesWorkflowRedBinding('legacy red without typed scope', '')
    ).toBe(false);
    expect(matchesWorkflowRedBinding(`## Evidence\n\n${latest}\n`, '')).toBe(
      false
    );
  });
});

describe('existing Linear recovery adapter', () => {
  it('retains the active state when a scoped red upsert races a green close', async () => {
    const fingerprint = 'workflow-ci-duration-ratchet';
    const source = 'ci-duration-ratchet.yml';
    const binding = workflowRedBinding(run(2));
    const issue = {
      id: 'issue',
      title: fingerprint,
      state: { id: 'active', type: 'started' },
    };
    const reply = data => new Response(JSON.stringify({ data }));
    const fetchImpl = vi.fn(async (_url, request) => {
      const { query, variables } = JSON.parse(String(request.body));
      if (query.includes('FindTeamLabel'))
        return reply({ team: { labels: { nodes: [] } } });
      if (query.includes('FindIssueByFingerprint'))
        return reply({ issues: { nodes: [issue] } });
      expect(query).toContain('UpdateDedupedLinearIssue');
      issue.state = { id: 'done', type: 'completed' };
      expect(variables.input.stateId).toBe('active');
      expect(variables.input.description).toContain(binding);
      issue.state = { id: variables.input.stateId, type: 'started' };
      return reply({ issueUpdate: { success: true, issue } });
    });
    expect(
      await applyRemediationDecision(
        { action: 'red' },
        {
          fingerprint,
          source,
          fetchImpl,
          apiKey: 'fixture',
          redBinding: binding,
        }
      )
    ).toMatchObject({ ok: true, action: 'updated', reopened: false });
    expect(issue.state).toEqual({ id: 'active', type: 'started' });
  });

  it.each([true, false])(
    'restores a raced write and reports unresolved even if restoration succeeds=%s',
    async restores => {
      const fingerprint = 'workflow-ci-duration-ratchet';
      const source = 'ci-duration-ratchet.yml';
      const old = workflowRedBinding(run(1));
      const newer = workflowRedBinding(run(2));
      const issue = {
        id: 'issue',
        title: fingerprint,
        description: `Source-workflow: ${source}\n${old}`,
        state: { id: 'active', type: 'started' },
      };
      const reply = data => new Response(JSON.stringify({ data }));
      const fetchImpl = vi.fn(async (_url, request) => {
        const { query, variables } = JSON.parse(String(request.body));
        if (query.includes('FindRemediationForGreen'))
          return reply({
            issues: { nodes: [issue] },
            team: {
              states: {
                nodes: [{ id: 'done', name: 'Done', type: 'completed' }],
              },
            },
          });
        if (query.includes('mutation ResolveRemediation')) {
          issue.description = `Source-workflow: ${source}\n${newer}`;
          issue.state = { id: 'done', type: 'completed' };
          return reply({ issueUpdate: { success: true, issue } });
        }
        expect(query).toContain('mutation RestoreRemediationOpen');
        expect(variables).toEqual({ id: 'issue', stateId: 'active' });
        if (restores) issue.state = { id: 'active', type: 'started' };
        return reply({ issueUpdate: { success: restores, issue } });
      });
      const result = await applyRemediationDecision(
        { action: 'green' },
        {
          fingerprint,
          source,
          fetchImpl,
          apiKey: 'fixture',
          redBinding: old,
        }
      );
      expect(result).toMatchObject({
        ok: false,
        results: [
          {
            reason: restores
              ? 'linear_close_evidence_unconfirmed_restored'
              : 'linear_close_evidence_unconfirmed_restore_failed',
          },
        ],
      });
      expect(issue.description).toContain(newer);
      expect(fetchImpl).toHaveBeenCalledTimes(3);
    }
  );

  it.each(['started', 'completed'])(
    'holds if the Linear binding changed in %s state',
    async type => {
      const fingerprint = 'workflow-ci-duration-ratchet';
      const source = 'ci-duration-ratchet.yml';
      const fetchImpl = vi.fn(async (_url, request) => {
        const { query } = JSON.parse(String(request.body));
        expect(query).toContain('FindRemediationForGreen');
        return new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: 'old',
                    identifier: 'JOV-14954',
                    title: `P0: ${fingerprint} is red (${fingerprint})`,
                    description: `Source-workflow: ${source}\n${workflowRedBinding(run(2))}`,
                    state: { type },
                  },
                ],
              },
            },
          })
        );
      });
      const result = await applyRemediationDecision(
        { action: 'green' },
        {
          fingerprint,
          source,
          fetchImpl,
          apiKey: 'fixture',
          redBinding: workflowRedBinding(run(1)),
          recoveryProof: 'fan-out-budget: pass',
        }
      );
      expect(result).toEqual({
        ok: true,
        action: 'hold',
        reason: 'linear_red_evidence_changed',
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );
});
