import { describe, expect, it } from 'vitest';
import {
  evaluateSecurityLinearDwell,
  observeSecurityAdvisoryDwell,
  selectSecurityDwellWaiting,
} from '../security-advisory-dwell.mjs';

const issue = (over = {}) => ({
  identifier: 'JOV-1',
  title: '[secadv-ghsa-xxxx-pkg] bad thing',
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
  description: '',
  state: { type: 'started', name: 'In Progress' },
  ...over,
});

describe('security-advisory-dwell', () => {
  it('finding-pr waits only on open secadv issues without a PR link', () => {
    const waiting = selectSecurityDwellWaiting(
      [
        issue(),
        issue({
          identifier: 'JOV-2',
          description: 'Fix: https://github.com/JovieInc/Jovie/pull/9',
        }),
        issue({
          identifier: 'JOV-3',
          state: { type: 'completed', name: 'Done' },
        }),
      ],
      'finding-pr'
    );
    expect(waiting.map(row => row.id)).toEqual(['JOV-1']);
  });

  it('pr-production waits on open secadv issues that already link a PR', () => {
    const waiting = selectSecurityDwellWaiting(
      [
        issue(),
        issue({
          identifier: 'JOV-2',
          description: 'https://github.com/JovieInc/Jovie/pull/9',
        }),
      ],
      'pr-production'
    );
    expect(waiting.map(row => row.id)).toEqual(['JOV-2']);
  });

  it('evaluate reports empty and oldest waiting with over-slo count', () => {
    const nowMs = Date.parse('2026-11-20T12:00:00.000Z');
    expect(
      evaluateSecurityLinearDwell({
        phase: 'finding-pr',
        issues: [],
        nowMs,
        dwellSloMinutes: 60,
      }).reason
    ).toMatch(/empty/);
    const aged = evaluateSecurityLinearDwell({
      phase: 'finding-pr',
      issues: [issue({ createdAt: '2026-11-20T00:00:00.000Z' })],
      nowMs,
      dwellSloMinutes: 60,
    });
    expect(aged.detailOnStale).toBe(true);
    expect(aged.reason).toMatch(/over-slo=1/);
    expect(aged.lastProofAt).toBe('2026-11-20T00:00:00.000Z');
  });

  it('observeSecurityAdvisoryDwell fails closed without Linear or bad phase', async () => {
    const nowMs = Date.parse('2026-11-20T12:00:00.000Z');
    expect(
      await observeSecurityAdvisoryDwell(
        { phase: 'detect-owned' },
        { linear: { graphql: async () => ({}) }, nowMs }
      )
    ).toEqual({ ok: false, reason: 'security-dwell-phase-invalid' });
    expect(
      await observeSecurityAdvisoryDwell(
        { phase: 'finding-pr' },
        { linear: null, nowMs }
      )
    ).toEqual({ ok: false, reason: 'linear-client-missing' });
  });

  it('observeSecurityAdvisoryDwell uses Linear nodes for finding-pr', async () => {
    const linear = {
      graphql: async () => ({
        issues: {
          nodes: [
            issue({ createdAt: '2026-11-19T00:00:00.000Z' }),
            issue({
              identifier: 'JOV-9',
              description: 'https://github.com/JovieInc/Jovie/pull/1',
            }),
          ],
        },
      }),
    };
    const observed = await observeSecurityAdvisoryDwell(
      { phase: 'finding-pr', dwellSloMinutes: 60 },
      { linear, nowMs: Date.parse('2026-11-20T00:00:00.000Z') }
    );
    expect(observed.ok).toBe(true);
    expect(observed.lastProofAt).toBe('2026-11-19T00:00:00.000Z');
    expect(observed.reason).toMatch(/oldest=JOV-1/);
  });
});
