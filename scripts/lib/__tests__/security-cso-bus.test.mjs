import { describe, expect, it } from 'vitest';
import {
  buildInvestigatePacket,
  INVESTIGATE_MARKER,
  linearSecurityCandidate,
  planCsoBusActions,
  requireFixPrBeforeClose,
  sarifHighCandidates,
} from '../security-cso-bus.mjs';

describe('security-cso-bus', () => {
  it('builds investigate packets with close instructions', () => {
    const body = buildInvestigatePacket({
      kind: 'linear-security',
      fingerprint: 'csec-abc',
      title: 'XSS in auth',
      evidence: 'apps/web/lib/auth.ts',
    });
    expect(body).toContain(INVESTIGATE_MARKER);
    expect(body).toContain('fingerprint: csec-abc');
    expect(body).toMatch(/Link a fix PR/);
  });

  it('selects Linear security issues and SARIF high alerts', () => {
    const linear = linearSecurityCandidate({
      title: '[security][high] xss (dsec-aaaaaaaaaaaa)',
      labels: ['security', 'Bug'],
      description: 'finding',
      identifier: 'JOV-9',
    });
    expect(linear?.kind).toBe('linear-security');
    expect(linear?.hasPacket).toBe(false);

    const sarif = sarifHighCandidates([
      {
        severity: 'high',
        ruleId: 'js/xss',
        path: 'a.ts',
        message: 'xss',
      },
      { severity: 'note', ruleId: 'style' },
    ]);
    expect(sarif).toHaveLength(1);
    expect(sarif[0].fingerprint).toMatch(/^csarf-/);
  });

  it('plans ensure-packet and blocks close without a fix PR', () => {
    const plan = planCsoBusActions({
      linearIssues: [
        {
          identifier: 'JOV-1',
          title: '[secadv-ghsa-x-left-pad] pad',
          labels: ['security'],
          description: 'open finding',
        },
        {
          identifier: 'JOV-2',
          title: '[security][high] xss (dsec-bbbbbbbbbbbb)',
          labels: ['area:security'],
          description: `${INVESTIGATE_MARKER}\nhttps://github.com/JovieInc/Jovie/pull/12`,
        },
      ],
      sarifAlerts: [
        {
          severity: 'critical',
          ruleId: 'sql-injection',
          path: 'db.ts',
          message: 'sqli',
        },
      ],
      closingIdentifiers: ['JOV-1', 'JOV-2'],
    });
    expect(
      plan.ensure.some(row => 'identifier' in row && row.identifier === 'JOV-1')
    ).toBe(true);
    expect(plan.ensure.some(row => row.kind === 'sarif-high')).toBe(true);
    expect(
      plan.ensure.some(row => 'identifier' in row && row.identifier === 'JOV-2')
    ).toBe(false);
    expect(plan.blockClose.map(row => row.identifier)).toEqual(['JOV-1']);
    expect(
      requireFixPrBeforeClose('https://github.com/JovieInc/Jovie/pull/3')
    ).toEqual({
      ok: true,
      prs: ['https://github.com/JovieInc/Jovie/pull/3'],
    });
  });
});
