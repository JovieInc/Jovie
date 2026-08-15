import { describe, expect, it } from 'vitest';

import {
  beginAwaitingVerification,
  blockForExternalAuthority,
  type DeliveryLease,
  recordReceipt,
  startInternalRemediation,
  watchdogDecision,
} from '../delivery-liveness';

const NOW = '2026-08-15T02:00:00.000Z';

function authLease(): DeliveryLease {
  return beginAwaitingVerification({
    repo: 'JovieInc/Jovie',
    issue: 5142,
    issueText: 'Repair production auth runtime and prove OAuth smoke',
    pr: 15970,
    prUrl: 'https://github.com/JovieInc/Jovie/pull/15970',
    sourceSubject: 'a'.repeat(40),
    now: NOW,
  });
}

describe('delivery liveness controller', () => {
  it('keeps a PR active until every requested proof tier is present', () => {
    let lease = authLease();
    expect(lease.status).toBe('awaiting_verification');
    expect(lease.requestedOutcomes).toEqual([
      'source',
      'ci',
      'merge',
      'deploy',
      'runtime',
    ]);

    for (const [index, tier] of (
      ['ci', 'merge', 'deploy'] as const
    ).entries()) {
      lease = recordReceipt(lease, {
        tier,
        observedAt: `2026-08-15T02:0${index + 1}:00.000Z`,
        subject: tier,
        evidence: `https://example.test/${tier}`,
      });
      expect(lease.status).toBe('awaiting_verification');
    }
    lease = recordReceipt(lease, {
      tier: 'runtime',
      observedAt: '2026-08-15T02:05:00.000Z',
      subject: 'oauth-smoke',
      evidence: 'https://example.test/runtime',
    });
    expect(lease.status).toBe('complete');
  });

  it('turns internal failure into active remediation with an immediate start receipt', () => {
    const remediating = startInternalRemediation({
      lease: authLease(),
      evidence: 'typecheck failed',
      now: '2026-08-15T02:01:00.000Z',
    });
    expect(remediating.status).toBe('remediating');
    expect(remediating.blocked).toBeNull();
    expect(remediating.acceptedOwner?.startReceipt).toMatch(
      /^internal-remediation:/
    );
  });

  it('retries or reassigns a lease with no fresh receipt for five minutes', () => {
    expect(
      watchdogDecision(authLease(), '2026-08-15T02:05:01.000Z')
    ).toMatchObject({ action: 'retry_or_reassign', reason: 'stale_receipt' });
  });

  it('does not make an unchanged receipt look fresh on every watchdog tick', () => {
    const first = recordReceipt(authLease(), {
      tier: 'ci',
      observedAt: '2026-08-15T02:01:00.000Z',
      subject: 'a'.repeat(40),
      evidence: 'https://example.test/checks',
    });
    const replay = recordReceipt(first, {
      tier: 'ci',
      observedAt: '2026-08-15T02:04:00.000Z',
      subject: 'a'.repeat(40),
      evidence: 'https://example.test/checks',
    });
    expect(replay.lastReceiptAt).toBe('2026-08-15T02:01:00.000Z');
  });

  it('rejects blocked state until the entire remediation ladder is evidenced', () => {
    const lease = startInternalRemediation({
      lease: authLease(),
      evidence: 'fresh retry failed',
      now: '2026-08-15T02:01:00.000Z',
    });
    expect(() =>
      blockForExternalAuthority({
        lease,
        block: {
          reason: 'account_2fa',
          evidence: 'provider requires account owner 2FA',
          decisionPacket: 'Complete provider 2FA for the production account.',
          criticalLane: 'summer',
        },
      })
    ).toThrow(/remediation_ladder_incomplete/);
  });

  it('allows blocked only for a machine-readable external authority after the ladder', () => {
    const base = startInternalRemediation({
      lease: authLease(),
      evidence: 'fresh retry failed',
      now: '2026-08-15T02:01:00.000Z',
    });
    const observedAt = '2026-08-15T02:02:00.000Z';
    const lease: DeliveryLease = {
      ...base,
      remediation: [
        ...base.remediation,
        ...[
          'alternate_local_path',
          'docs_source_inspection',
          'reasoning_escalation',
          'peer_agent_assist',
          'decision_packet',
        ].map(step => ({
          step: step as
            | 'alternate_local_path'
            | 'docs_source_inspection'
            | 'reasoning_escalation'
            | 'peer_agent_assist'
            | 'decision_packet',
          observedAt,
          evidence: `${step}:attempted`,
        })),
      ],
    };
    const blocked = blockForExternalAuthority({
      lease,
      block: {
        reason: 'credential',
        evidence: 'credential absent from every supported store',
        decisionPacket:
          'Authorize creation of the missing production credential.',
        criticalLane: 'summer',
      },
      now: observedAt,
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.blocked?.reason).toBe('credential');
  });
});
