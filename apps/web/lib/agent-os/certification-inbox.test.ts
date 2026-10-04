import { describe, expect, it } from 'vitest';
import {
  buildCertificationDecisionDigest,
  type CertificationEvidenceReceipt,
  type CertificationEvidenceStatus,
  type CertificationEvidenceTier,
  type CertificationReviewPacket,
  evaluateCertificationAdmission,
  type FounderCertificationDecision,
  recordFounderCertificationDecision,
} from './certification';
import {
  CERTIFICATION_INBOX_CONTRACT,
  type CertificationInboxDelivery,
  projectCertificationInbox,
} from './certification-inbox';

const SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OBSERVED = '2026-09-17T00:00:00.000Z';

function receipt(
  tier: CertificationEvidenceTier,
  id: string,
  status: CertificationEvidenceStatus = 'passed'
): CertificationEvidenceReceipt {
  return {
    digest: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    id,
    ref: `github:JovieInc/Jovie/${id}`,
    sourceSha: SHA,
    status,
    summary: `${tier} ${status}`,
    tier,
  };
}

function packet(
  subjectId: string,
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
  return {
    canonicalReferences: [receipt('canonical_references', `${subjectId}-ref`)],
    contract: 'jovie.certification/v1',
    invariantEvaluation: [
      receipt('invariant_evaluation', `${subjectId}-invariant`),
    ],
    itemMedia: [],
    requiredVariants: [],
    source: {
      paths: [`apps/web/lib/${subjectId}.ts`],
      ref: 'main',
      repository: 'JovieInc/Jovie',
      sha: SHA,
    },
    subject: {
      id: subjectId,
      kind: 'component',
      title: `Subject ${subjectId}`,
    },
    testsCoverage: [receipt('tests_coverage', `${subjectId}-tests`)],
    visualProof: [receipt('visual_proof', `${subjectId}-visual`)],
    ...overrides,
  };
}

function delivery(
  subjectId: string,
  overrides: Partial<CertificationInboxDelivery> = {},
  packetOverrides: Partial<CertificationReviewPacket> = {},
  decisions: readonly FounderCertificationDecision[] = []
): CertificationInboxDelivery {
  const reviewPacket = packet(subjectId, packetOverrides);
  return {
    admission: evaluateCertificationAdmission({
      evaluatedAt: OBSERVED,
      decisions,
      packet: reviewPacket,
    }),
    domain: 'marketing_component',
    observedAt: OBSERVED,
    packet: reviewPacket,
    ...overrides,
  };
}

function approvedDecision(
  subjectId: string,
  evidenceDigest: string
): FounderCertificationDecision {
  return {
    decidedAt: OBSERVED,
    decision: 'approved',
    evidenceDigest,
    id: `decision-${subjectId}`,
    notes: null,
    reviewer: 'tim',
    subjectId,
  };
}

describe('projectCertificationInbox', () => {
  it('admits review-ready items into one ranked needs-you queue', () => {
    const queue = projectCertificationInbox([
      delivery('low-value', {
        ranking: { impact: 1, urgency: 1 },
      }),
      delivery('high-value', {
        domain: 'experiment',
        ranking: { impact: 8, unblockValue: 9, urgency: 7 },
        requestedDecision: 'certify experiment launch',
      }),
      delivery('mid-value', {
        domain: 'artist_candidate',
        ranking: { impact: 5, urgency: 5 },
      }),
    ]);

    expect(queue.contract).toBe(CERTIFICATION_INBOX_CONTRACT);
    expect(queue.needsYou.map(item => item.subject.id)).toEqual([
      'high-value',
      'mid-value',
      'low-value',
    ]);
    expect(queue.needsYou[0]?.domain).toBe('experiment');
    expect(queue.needsYou[0]?.requestedDecision).toBe(
      'certify experiment launch'
    );
    expect(queue.needsYou[0]?.actions).toEqual([
      'certify',
      'reject',
      'modify',
      'request_evidence',
    ]);
    expect(queue.blocked).toEqual([]);
    expect(queue.certified).toEqual([]);
  });

  it('ranks cheaper founder decisions first when scores tie', () => {
    const queue = projectCertificationInbox([
      delivery('slow', { ranking: { founderMinutes: 30, impact: 5 } }),
      delivery('quick', { ranking: { founderMinutes: 2, impact: 5 } }),
    ]);

    expect(queue.needsYou.map(item => item.subject.id)).toEqual([
      'quick',
      'slow',
    ]);
  });

  it('keeps machine-certified objects in the browsable catalog, not the queue', () => {
    const healthyPacket = packet('healthy');
    const digest = buildCertificationDecisionDigest(healthyPacket);
    const queue = projectCertificationInbox([
      delivery('healthy', {}, healthyPacket, [
        approvedDecision('healthy', digest),
      ]),
    ]);

    expect(queue.needsYou).toEqual([]);
    expect(queue.certified.map(item => item.subject.id)).toEqual(['healthy']);
    expect(queue.certified[0]?.state).toBe('founder_locked');
    expect(queue.certified[0]?.actions).toEqual([]);
  });

  it('shows incomplete packets as blocked instead of hiding them as ready', () => {
    const queue = projectCertificationInbox([
      delivery('missing-visual', {}, { visualProof: [] }),
      delivery(
        'failing-tests',
        {},
        {
          testsCoverage: [
            receipt('tests_coverage', 'failing-tests-tests', 'failed'),
          ],
        }
      ),
    ]);

    expect(queue.needsYou).toEqual([]);
    expect(queue.blocked.map(item => item.subject.id).sort()).toEqual([
      'failing-tests',
      'missing-visual',
    ]);
    expect(
      queue.blocked.flatMap(item => item.blockers.map(b => b.code))
    ).toEqual(
      expect.arrayContaining(['visual_proof_missing', 'tests_coverage_failed'])
    );
  });

  it('keeps a stale founder lock outside the ready queue until its new evidence is complete', () => {
    const staleDigest = 'sha256:stale'.padEnd(71, '0');
    const queue = projectCertificationInbox([
      delivery('revised', {}, { visualProof: [] }, [
        approvedDecision('revised', staleDigest),
      ]),
    ]);

    expect(queue.needsYou).toEqual([]);
    expect(queue.stale.map(item => item.subject.id)).toEqual(['revised']);
    expect(queue.stale[0]?.staleFounderLock).toBe(true);
  });

  it('asks for re-certification of a review-ready stale lock as a revenue regression', () => {
    const staleDigest = 'sha256:stale'.padEnd(71, '0');
    const queue = projectCertificationInbox([
      delivery(
        'checkout',
        {},
        { subject: { id: 'checkout', kind: 'flow', title: 'Pro checkout' } },
        [approvedDecision('checkout', staleDigest)]
      ),
    ]);

    expect(queue.stale).toEqual([]);
    expect(queue.needsYou[0]).toMatchObject({
      revenueTier: 'revenue_path_regression',
      revenueTierRank: 2,
      staleFounderLock: true,
    });
    expect(queue.needsYou[0]?.card?.whyNow).toContain(
      'evidence changed since your last approval'
    );
  });

  it('returns rejected and changes-requested items to remediation', () => {
    const rejectedPacket = packet('rejected-item');
    const result = recordFounderCertificationDecision({
      decidedAt: OBSERVED,
      decision: {
        decision: 'rejected',
        evidenceDigest: buildCertificationDecisionDigest(rejectedPacket),
        id: 'decision-rejected-item',
        notes: 'off-brand',
        reviewer: 'tim',
      },
      packet: rejectedPacket,
    });
    if (!result.ok) throw new Error('decision fixture must record');

    const queue = projectCertificationInbox([
      {
        admission: result.admission,
        domain: 'feature',
        observedAt: OBSERVED,
        packet: rejectedPacket,
      },
    ]);

    expect(queue.needsYou).toEqual([]);
    expect(queue.returned.map(item => item.subject.id)).toEqual([
      'rejected-item',
    ]);
    expect(queue.returned[0]?.lastDecision).toBe('rejected');
  });

  it('dedupes deliveries by subject and keeps only the newest revision', () => {
    const older = delivery('candidate-1', {
      observedAt: '2026-09-10T00:00:00.000Z',
    });
    const newer = delivery(
      'candidate-1',
      {
        observedAt: '2026-09-16T00:00:00.000Z',
      },
      { subject: { id: 'candidate-1', kind: 'artist_candidate', title: 'New' } }
    );

    const queue = projectCertificationInbox([older, newer]);

    expect(queue.needsYou.map(item => item.subject.id)).toEqual([
      'candidate-1',
    ]);
    expect(queue.needsYou[0]?.observedAt).toBe('2026-09-16T00:00:00.000Z');
    expect(queue.superseded.map(item => item.observedAt)).toEqual([
      '2026-09-10T00:00:00.000Z',
    ]);
    expect(queue.superseded[0]?.actions).toEqual([]);
  });

  it('does not let the same subject from different domains collide', () => {
    const queue = projectCertificationInbox([
      delivery('shared-id', { domain: 'marketing_component' }),
      delivery('shared-id', { domain: 'design_system' }),
    ]);

    expect(queue.needsYou).toHaveLength(2);
    expect(queue.superseded).toEqual([]);
  });
});

describe('revenue-weighted founder queue (JOV-7695)', () => {
  it('ranks by revenue tier before decision score, never FIFO', () => {
    const queue = projectCertificationInbox([
      delivery('loud-docs-page', { ranking: { impact: 10, urgency: 10 } }),
      delivery(
        'signup-flow',
        { domain: 'flows', ranking: { impact: 1 } },
        { subject: { id: 'signup-flow', kind: 'flow', title: 'Artist signup' } }
      ),
      delivery('lyb-surface', {
        domain: 'lyb',
        ranking: { impact: 10, urgency: 10, unblockValue: 10 },
      }),
      delivery('first-dollar', {
        ranking: { impact: 0 },
        revenue: {
          tier: 'first_dollar_blocker',
          unblocks: 'Approve the $199 offer copy so checkout can launch.',
        },
      }),
    ]);

    expect(
      queue.needsYou.map(item => [item.subject.id, item.revenueTierRank])
    ).toEqual([
      ['first-dollar', 1],
      ['signup-flow', 3],
      ['loud-docs-page', 4],
      ['lyb-surface', 5],
    ]);
    expect(queue.needsYou[0]?.card?.unblocks).toBe(
      'Approve the $199 offer copy so checkout can launch.'
    );
  });

  it('holds review-ready items whose operational evidence is red or unknown', () => {
    const operational = (status: CertificationEvidenceStatus) => ({
      operational: {
        ci: [receipt('ci', 'ci-run', 'passed')],
        deploy: [receipt('deploy', 'deploy-run', status)],
      },
    });
    const queue = projectCertificationInbox([
      delivery('deploy-red', {}, operational('failed')),
      delivery('deploy-pending', {}, operational('pending')),
      delivery('deploy-green', {}, operational('passed')),
    ]);

    expect(queue.needsYou.map(item => item.subject.id)).toEqual([
      'deploy-green',
    ]);
    expect(queue.blocked.map(item => item.subject.id).sort()).toEqual([
      'deploy-pending',
      'deploy-red',
    ]);
    expect(queue.blocked.every(item => item.heldForMachineEvidence)).toBe(true);
    expect(queue.blocked.every(item => item.actions.length === 0)).toBe(true);
    expect(
      queue.blocked.flatMap(item => item.blockers.map(b => b.code)).sort()
    ).toEqual(['deploy_failed', 'deploy_missing']);
  });

  it('holds items whose domain machine evidence is not green', () => {
    const queue = projectCertificationInbox([
      delivery('prospect', {
        domain: 'customers',
        machineEvidence: {
          status: 'unknown',
          summary: 'ACQUISITION_ELIGIBLE is false (UNKNOWN)',
        },
      }),
    ]);

    expect(queue.needsYou).toEqual([]);
    expect(queue.blocked[0]?.blockers.at(-1)).toMatchObject({
      code: 'machine_evidence_unknown',
      summary: 'ACQUISITION_ELIGIBLE is false (UNKNOWN)',
    });
  });

  it('answers the six founder questions on every needs-you card', () => {
    const queue = projectCertificationInbox([
      delivery(
        'claim',
        { domain: 'flows', requestedDecision: 'Certify the claim flow copy.' },
        {
          operational: { deploy: [receipt('deploy', 'prod-deploy')] },
          subject: { id: 'claim', kind: 'flow', title: 'Claim flow' },
        }
      ),
    ]);
    const card = queue.needsYou[0]?.card;

    expect(card?.whyNow).toContain('Revenue tier 3');
    expect(card?.journey).toBe('Claim flow (flow, flows)');
    expect(card?.revision).toBe(`main@${SHA.slice(0, 12)}`);
    expect(card?.greenEvidence).toEqual(
      expect.arrayContaining([
        'deploy: deploy passed (github:JovieInc/Jovie/prod-deploy)',
        'tests_coverage: tests_coverage passed (github:JovieInc/Jovie/claim-tests)',
      ])
    );
    expect(card?.unblocks).toContain('stranger');
    expect(card?.decision).toBe('Certify the claim flow copy.');
    expect(card?.consequences.accept).toContain(
      queue.needsYou[0]?.decisionEvidenceDigest ?? 'missing'
    );
    expect(card?.consequences.reject).toContain('rework');
    expect(card?.consequences.comment).toContain('remediation');
  });

  it('carries no card on items that ask nothing of the founder', () => {
    const queue = projectCertificationInbox([
      delivery('incomplete', {}, { visualProof: [] }),
    ]);
    expect(queue.blocked[0]?.card).toBeNull();
    expect(queue.blocked[0]?.heldForMachineEvidence).toBe(false);
  });
});
