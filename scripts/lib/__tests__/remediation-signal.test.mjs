import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  applyRemediationDecision,
  decideAuthSmokeSignal,
  decideLoginSignal,
  decideMonitorSignal,
  gateSteadyGreen,
  remediationIntakeDisabled,
} from '../remediation-signal.mjs';

const workflows = {
  nightly: '.github/workflows/nightly-tests.yml',
  matrix: '.github/workflows/e2e-full-matrix.yml',
  continuity: '.github/workflows/production-continuity.yml',
  controller: '.github/workflows/production-controller.yml',
  health: '.github/workflows/production-controller-health.yml',
  release: '.github/workflows/production-release.yml',
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
    expect(decideLoginSignal({ conclusion: 'success' }).action).toBe('green');
    expect(decideLoginSignal({ conclusion: 'cancelled' }).action).toBe('skip');
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
    expect(bodies.health).toContain('production-monitor-controller-health');
    expect(bodies.release).toContain('production-monitor-vercel-deploy');
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
