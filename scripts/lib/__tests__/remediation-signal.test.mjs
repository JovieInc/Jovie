import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  applyRemediationDecision,
  decideAuthSmokeSignal,
  decideLoginSignal,
  decideMonitorSignal,
  remediationIntakeDisabled,
  remediationTitle,
} from '../remediation-signal.mjs';

const workflows = {
  nightly: '.github/workflows/nightly-tests.yml',
  matrix: '.github/workflows/e2e-full-matrix.yml',
  continuity: '.github/workflows/production-continuity.yml',
  controller: '.github/workflows/production-controller.yml',
  health: '.github/workflows/production-controller-health.yml',
  release: '.github/workflows/production-release.yml',
};

function jsonResponse(body, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  };
}

describe('remediationIntakeDisabled', () => {
  it('files unless the kill switch is exactly 1', () => {
    expect(remediationIntakeDisabled({})).toBe(false);
    expect(remediationIntakeDisabled({ REMEDIATION_INTAKE_DISABLED: '' })).toBe(
      false
    );
    expect(
      remediationIntakeDisabled({ REMEDIATION_INTAKE_DISABLED: '0' })
    ).toBe(false);
    expect(
      remediationIntakeDisabled({ REMEDIATION_INTAKE_DISABLED: '1' })
    ).toBe(true);
  });
});

describe('decideLoginSignal', () => {
  it('files e2e-login-timeout only when Playwright shows a login timeout', () => {
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
    expect(decideLoginSignal({ conclusion: 'failure', report })).toMatchObject({
      action: 'red',
      fingerprint: 'e2e-login-timeout',
    });
    expect(
      decideLoginSignal({
        conclusion: 'failure',
        evidenceText: 'auth.setup.ts\nTest timeout of 90000ms exceeded',
      }).fingerprint
    ).toBe('e2e-login-timeout');
    expect(
      decideLoginSignal({
        conclusion: 'failure',
        evidenceText: 'dashboard.spec.ts\nexpected heading to be visible',
      })
    ).toEqual({ action: 'skip' });
    expect(decideLoginSignal({ conclusion: 'cancelled' })).toEqual({
      action: 'skip',
    });
  });

  it('resolves the login key when the login step passed', () => {
    expect(decideLoginSignal({ conclusion: 'success' })).toEqual({
      action: 'green',
      fingerprints: ['e2e-login-timeout'],
    });
    expect(decideLoginSignal({ conclusion: 'skipped' })).toEqual({
      action: 'skip',
    });
  });
});

describe('decideAuthSmokeSignal', () => {
  it('splits login timeout from other auth-smoke failures', () => {
    expect(
      decideAuthSmokeSignal({ jobResult: 'cancelled', authStatus: '' })
    ).toMatchObject({ action: 'red', fingerprint: 'e2e-login-timeout' });
    expect(
      decideAuthSmokeSignal({ jobResult: 'failure', loginTimeout: 'true' })
    ).toMatchObject({ fingerprint: 'e2e-login-timeout' });
    expect(
      decideAuthSmokeSignal({ jobResult: 'failure', loginTimeout: 'false' })
    ).toMatchObject({ fingerprint: 'production-monitor-auth-smoke' });
    expect(
      decideAuthSmokeSignal({
        jobResult: 'success',
        authStatus: 'not-configured',
      })
    ).toEqual({ action: 'skip' });
    expect(
      decideAuthSmokeSignal({ jobResult: 'success', authStatus: 'passed' })
    ).toEqual({
      action: 'green',
      fingerprints: ['e2e-login-timeout', 'production-monitor-auth-smoke'],
    });
  });
});

describe('decideMonitorSignal', () => {
  it('maps production check conclusions', () => {
    expect(decideMonitorSignal({ conclusion: 'failure' })).toEqual({
      action: 'red',
    });
    expect(decideMonitorSignal({ conclusion: 'cancelled' })).toEqual({
      action: 'red',
    });
    expect(decideMonitorSignal({ conclusion: 'success' })).toEqual({
      action: 'green',
    });
    expect(decideMonitorSignal({ conclusion: 'skipped' })).toEqual({
      action: 'skip',
    });
  });
});

describe('applyRemediationDecision', () => {
  it('fails closed when Linear has no key on a red signal', async () => {
    const result = await applyRemediationDecision(
      { action: 'red', fingerprint: 'production-monitor-continuity' },
      { source: 'production-continuity.yml', apiKey: '' }
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_linear_api_key');
  });

  it('does not close a login issue opened by a different workflow', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: {
          team: {
            states: {
              nodes: [{ id: 'done', name: 'Done', type: 'completed' }],
            },
          },
          issues: {
            nodes: [
              {
                id: 'iss-1',
                identifier: 'JOV-1',
                title: remediationTitle('e2e-login-timeout'),
                description: 'Source-workflow: nightly-tests.yml',
                state: { type: 'unstarted', name: 'Todo' },
                labels: {
                  nodes: [{ id: 'lab', name: 'remediation:e2e-login-timeout' }],
                },
              },
            ],
          },
        },
      })
    );
    const result = await applyRemediationDecision(
      { action: 'green', fingerprints: ['e2e-login-timeout'] },
      {
        source: 'e2e-full-matrix.yml:chromium',
        apiKey: 'lin',
        fetchImpl,
      }
    );
    expect(result.ok).toBe(true);
    expect(result.results[0].action).toBe('source_mismatch');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('workflow wiring', () => {
  const bodies = Object.fromEntries(
    Object.entries(workflows).map(([name, path]) => [
      name,
      readFileSync(path, 'utf8'),
    ])
  );

  it('wires login timeout and production monitors with a kill switch, not an opt-in', () => {
    expect(bodies.nightly).toContain('REMEDIATION_MODE: login');
    expect(bodies.nightly).toContain('REMEDIATION_SOURCE: nightly-tests.yml');
    expect(bodies.matrix).toContain('e2e-full-matrix.yml:');
    expect(bodies.continuity).toContain('production-monitor-continuity');
    expect(bodies.controller).toContain('production-monitor-post-deploy-smoke');
    expect(bodies.controller).toContain('REMEDIATION_MODE: auth-smoke');
    expect(bodies.health).toContain('production-monitor-controller-health');
    expect(bodies.release).toContain('production-monitor-vercel-deploy');
    for (const body of Object.values(bodies)) {
      expect(body).toContain('REMEDIATION_INTAKE_DISABLED');
      expect(body).not.toContain('REMEDIATION_INTAKE_ENABLED');
    }
  });
});
