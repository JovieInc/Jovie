import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { clearRemediationLabelCache } from '../linear-issue-intake.mjs';
import {
  AGENT_READY_LABEL,
  applyRemediationDecision,
  applyRemediationDecisionWithRetry,
  decideAuthSmokeSignal,
  decideLoginSignal,
  decideMonitorSignal,
  gateSteadyGreen,
  isTransientRemediationFailure,
  remediationIntakeDisabled,
} from '../remediation-signal.mjs';

const workflows = {
  nightly: '.github/workflows/nightly-tests.yml',
  matrix: '.github/workflows/e2e-full-matrix.yml',
  continuity: '.github/workflows/production-continuity.yml',
  controller: '.github/workflows/production-controller.yml',
  health: '.github/workflows/production-controller-health.yml',
  release: '.github/workflows/production-release.yml',
  postdeploy: '.github/workflows/postdeploy-probes.yml',
};

describe('remediationIntakeDisabled', () => {
  it('files unless the kill switch is exactly 1', () => {
    expect(remediationIntakeDisabled({})).toBe(false);
    expect(
      remediationIntakeDisabled({ REMEDIATION_INTAKE_DISABLED: '0' })
    ).toBe(false);
    expect(
      remediationIntakeDisabled({ REMEDIATION_INTAKE_DISABLED: '1' })
    ).toBe(true);
  });
});

describe('decideLoginSignal', () => {
  it('files e2e-login-timeout only for a login timeout', () => {
    const report = {
      suites: [
        {
          file: 'auth.setup.ts',
          specs: [
            {
              title: 'authenticate',
              tests: [{ results: [{ status: 'timedOut' }] }],
            },
          ],
        },
      ],
    };
    expect(
      decideLoginSignal({ conclusion: 'failure', report }).fingerprint
    ).toBe('e2e-login-timeout');
    expect(
      decideLoginSignal({
        conclusion: 'failure',
        evidenceText: 'auth.setup.ts\nTest timeout of 90000ms exceeded',
      }).action
    ).toBe('red');
    expect(
      decideLoginSignal({
        conclusion: 'failure',
        evidenceText: 'dashboard.spec.ts\nexpected heading',
      }).action
    ).toBe('skip');
    // Dev-server route logs must not pair with an unrelated test timeout.
    expect(
      decideLoginSignal({
        conclusion: 'failure',
        evidenceText:
          '[WebServer]  GET /signin 200 in 90ms\n[WebServer]  GET /signin?redirect_url=%2Fapp%2Fchat 200 in 89ms\ndashboard.spec.ts\nTimeout:  60000ms',
      }).action
    ).toBe('skip');
    expect(decideLoginSignal({ conclusion: 'success' }).action).toBe('green');
    expect(decideLoginSignal({ conclusion: 'cancelled' }).action).toBe('skip');
    // A cancelled run never files, even with login-timeout-looking evidence:
    // shutdown timeouts are artifacts and the superseding run reports itself.
    expect(
      decideLoginSignal({
        conclusion: 'cancelled',
        evidenceText: 'auth.setup.ts\nTest timeout of 90000ms exceeded',
      }).action
    ).toBe('skip');
  });
});

describe('decideAuthSmokeSignal', () => {
  it('splits a login timeout from other auth-smoke failures', () => {
    expect(decideAuthSmokeSignal({ jobResult: 'cancelled' }).fingerprint).toBe(
      'e2e-login-timeout'
    );
    expect(
      decideAuthSmokeSignal({ jobResult: 'failure', loginTimeout: 'false' })
        .fingerprint
    ).toBe('production-monitor-auth-smoke');
    expect(
      decideAuthSmokeSignal({
        jobResult: 'success',
        authStatus: 'not-configured',
      }).action
    ).toBe('skip');
    expect(
      decideAuthSmokeSignal({ jobResult: 'success', authStatus: 'passed' })
        .fingerprints
    ).toEqual(['e2e-login-timeout', 'production-monitor-auth-smoke']);
  });
});

describe('decideMonitorSignal', () => {
  it('maps production check conclusions', () => {
    expect(decideMonitorSignal({ conclusion: 'failure' }).action).toBe('red');
    expect(decideMonitorSignal({ conclusion: 'success' }).action).toBe('green');
    expect(decideMonitorSignal({ conclusion: 'skipped' }).action).toBe('skip');
  });
});

describe('gateSteadyGreen', () => {
  it('skips Linear on steady green and still files a red', async () => {
    expect(gateSteadyGreen({ action: 'green' }, '', '1').reason).toBe(
      'steady_green'
    );
    expect(gateSteadyGreen({ action: 'green' }, 'red', '1').action).toBe(
      'green'
    );
    expect(gateSteadyGreen({ action: 'red' }, 'green', '1').action).toBe('red');
    expect(gateSteadyGreen({ action: 'green' }, 'green', '').action).toBe(
      'green'
    );
    const fetchImpl = vi.fn();
    const skipped = gateSteadyGreen({ action: 'green' }, 'green', '1');
    await expect(
      applyRemediationDecision(skipped, { apiKey: '', fetchImpl })
    ).resolves.toEqual({ ok: true, action: 'skip' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on red when Linear has no key', async () => {
    const result = await applyRemediationDecision(
      { action: 'red', fingerprint: 'production-monitor-continuity' },
      { source: 'production-continuity.yml', apiKey: '' }
    );
    expect('reason' in result && result.reason).toBe('missing_linear_api_key');
  });
});

function linearStub(issueNodes) {
  const calls = [];
  const fetchImpl = vi.fn(async (_url, init) => {
    const payload = JSON.parse(String(init.body));
    calls.push(payload);
    const reply = data => new Response(JSON.stringify({ data }));
    if (payload.query.includes('FindTeamLabel')) {
      return reply({
        team: {
          labels: { nodes: [{ id: 'lbl-ready', name: AGENT_READY_LABEL }] },
        },
      });
    }
    if (payload.query.includes('FindIssueByFingerprint')) {
      return reply({
        team: {
          states: {
            nodes: [
              { id: 'st-todo', name: 'Todo', type: 'unstarted' },
              { id: 'st-backlog', name: 'Backlog', type: 'backlog' },
            ],
          },
          labels: {
            nodes: [
              {
                id: 'lbl-key',
                name: 'remediation:production-monitor-continuity',
              },
            ],
          },
        },
        issues: { nodes: issueNodes },
      });
    }
    if (payload.query.includes('FindIssueByRemediationLabel')) {
      return reply({ issues: { nodes: [] } });
    }
    if (payload.query.includes('issueCreate')) {
      return reply({
        issueCreate: {
          success: true,
          issue: { id: 'new', identifier: 'JOV-1', url: 'u' },
        },
      });
    }
    if (payload.query.includes('issueUpdate')) {
      return reply({
        issueUpdate: {
          success: true,
          issue: { id: 'old', identifier: 'JOV-2', url: 'u' },
        },
      });
    }
    throw new Error(`unexpected Linear query: ${payload.query}`);
  });
  return { calls, fetchImpl };
}

describe('red remediation is agent-ready', () => {
  const red = { action: 'red', fingerprint: 'production-monitor-continuity' };
  const context = run => ({
    source: 'production-continuity.yml',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    apiKey: 'lin_test',
    fetchImpl: run.fetchImpl,
  });

  it('creates the deduped P0 in Todo with agent-ready and the run url', async () => {
    clearRemediationLabelCache();
    const run = linearStub([]);
    const result = await applyRemediationDecision(red, context(run));
    expect(result.ok).toBe(true);
    const create = run.calls.find(call => call.query.includes('issueCreate'));
    expect(create.variables.stateId).toBe('st-todo');
    expect(create.variables.labelIds).toEqual(
      expect.arrayContaining(['lbl-ready', 'lbl-key'])
    );
    expect(create.variables.description).toContain(
      'https://github.com/JovieInc/Jovie/actions/runs/1'
    );
  });

  it('re-adds agent-ready when a closed signal reopens', async () => {
    clearRemediationLabelCache();
    const run = linearStub([
      {
        id: 'old',
        identifier: 'JOV-2',
        url: 'u',
        title:
          'P0: production-monitor-continuity is red (production-monitor-continuity)',
        state: { id: 'st-done', name: 'Done', type: 'completed' },
        labels: {
          nodes: [
            {
              id: 'lbl-key',
              name: 'remediation:production-monitor-continuity',
            },
          ],
        },
      },
    ]);
    const result = await applyRemediationDecision(red, context(run));
    expect(result).toMatchObject({
      ok: true,
      action: 'updated',
      reopened: true,
    });
    const update = run.calls.find(call => call.query.includes('issueUpdate'));
    expect(update.variables.input.stateId).toBe('st-todo');
    expect(update.variables.input.labelIds).toEqual(
      expect.arrayContaining(['lbl-ready', 'lbl-key'])
    );
    expect(run.calls.some(call => call.query.includes('issueCreate'))).toBe(
      false
    );
  });
});

describe('applyRemediationDecisionWithRetry', () => {
  const red = { action: 'red', fingerprint: 'production-monitor-continuity' };
  const context = fetchImpl => ({
    source: 'production-continuity.yml',
    runUrl: 'https://github.com/JovieInc/Jovie/actions/runs/1',
    apiKey: 'lin_test',
    fetchImpl,
  });
  const noSleep = async () => {};

  it('classifies only upstream resets and 5xx as transient', () => {
    expect(
      isTransientRemediationFailure({ ok: false, reason: 'linear_update_503' })
    ).toBe(true);
    expect(
      isTransientRemediationFailure({
        ok: false,
        reason: 'linear_update_transport',
      })
    ).toBe(true);
    expect(
      isTransientRemediationFailure({ ok: false, reason: 'linear_update_400' })
    ).toBe(false);
    expect(
      isTransientRemediationFailure({
        ok: false,
        reason: 'missing_linear_api_key',
      })
    ).toBe(false);
    expect(isTransientRemediationFailure({ ok: true })).toBe(false);
  });

  it('retries a transient Linear 503 and files on the next attempt', async () => {
    clearRemediationLabelCache();
    const inner = linearStub([]);
    let createCalls = 0;
    const fetchImpl = vi.fn(async (url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('issueCreate')) {
        createCalls += 1;
        if (createCalls === 1) {
          return new Response('upstream connect error', { status: 503 });
        }
      }
      return inner.fetchImpl(url, init);
    });
    const result = await applyRemediationDecisionWithRetry(
      red,
      context(fetchImpl),
      { sleep: noSleep }
    );
    expect(result.ok).toBe(true);
    expect(createCalls).toBe(2);
  });

  it('stops retrying after the attempt budget', async () => {
    clearRemediationLabelCache();
    const inner = linearStub([]);
    const fetchImpl = vi.fn(async (url, init) => {
      const payload = JSON.parse(String(init.body));
      if (payload.query.includes('issueCreate')) {
        return new Response('upstream connect error', { status: 503 });
      }
      return inner.fetchImpl(url, init);
    });
    const result = await applyRemediationDecisionWithRetry(
      red,
      context(fetchImpl),
      { attempts: 2, sleep: noSleep }
    );
    expect(result.ok).toBe(false);
    expect('reason' in result && result.reason).toBe('linear_create_503');
    expect(
      fetchImpl.mock.calls.filter(([, init]) =>
        String(init.body).includes('issueCreate')
      )
    ).toHaveLength(2);
  });

  it('does not retry permanent failures', async () => {
    const fetchImpl = vi.fn();
    const result = await applyRemediationDecisionWithRetry(
      red,
      { ...context(fetchImpl), apiKey: '' },
      { sleep: noSleep }
    );
    expect(result.ok).toBe(false);
    expect('reason' in result && result.reason).toBe('missing_linear_api_key');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('workflow wiring', () => {
  const bodies = Object.fromEntries(
    Object.entries(workflows).map(([name, path]) => [
      name,
      readFileSync(path, 'utf8'),
    ])
  );

  it('wires detectors and gates only the 5-minute continuity probe', () => {
    expect(bodies.nightly).toContain('REMEDIATION_MODE: login');
    expect(bodies.matrix).toContain('e2e-full-matrix.yml:');
    expect(bodies.controller).toContain('production-monitor-post-deploy-smoke');
    expect(bodies.controller).toContain('REMEDIATION_MODE: auth-smoke');
    expect(bodies.controller).toContain(
      'production-monitor-customer-changelog'
    );
    expect(bodies.health).toContain('production-monitor-controller-health');
    expect(bodies.release).toContain('production-monitor-vercel-deploy');
    expect(bodies.postdeploy).toContain('production-monitor-postdeploy-probes');
    expect(bodies.continuity).toContain("REMEDIATION_GATE_STEADY_GREEN: '1'");
    expect(bodies.continuity).toContain("REMEDIATION_FAIL_OPEN: '1'");
    expect(bodies.continuity).toContain('remediation-continuity-state');
    for (const [name, body] of Object.entries(bodies)) {
      expect(body).toContain('REMEDIATION_INTAKE_DISABLED');
      expect(body).not.toContain('REMEDIATION_INTAKE_ENABLED');
      if (name !== 'continuity') {
        expect(body).not.toContain('REMEDIATION_GATE_STEADY_GREEN');
      }
    }
  });
});
