import { describe, expect, it } from 'vitest';
import {
  buildCertificationDecisionDigest,
  type CertificationEvidenceReceipt,
  type CertificationReviewPacket,
  type CertificationState,
  evaluateCertificationAdmission,
  recordFounderCertificationDecision,
  shouldEmitTasteInboxCard,
} from '@/lib/agent-os/certification';

const SOURCE_SHA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const CHANGED_SHA = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
function receipt(
  tier: CertificationEvidenceReceipt['tier'],
  id: string = tier,
  sourceSha: string | null = SOURCE_SHA
): CertificationEvidenceReceipt {
  return {
    digest: `sha256:${id.padEnd(64, '0').slice(0, 64)}`,
    id,
    ref: `github:JovieInc/Jovie/${id}`,
    sourceSha,
    status: 'passed',
    summary: `${tier} passed`,
    tier,
  };
}
function reviewPacket(
  overrides: Partial<CertificationReviewPacket> = {}
): CertificationReviewPacket {
  return {
    canonicalReferences: [
      receipt('canonical_references', 'design-canon-reference'),
    ],
    contract: 'jovie.certification/v1',
    invariantEvaluation: [
      receipt('invariant_evaluation', 'invariant-evaluation'),
    ],
    itemMedia: [
      {
        digest:
          'sha256:media00000000000000000000000000000000000000000000000000000',
        id: 'variant-a-proof-video',
        itemId: 'feature-proof-library-row',
        ref: 'github:JovieInc/Jovie/actions/runs/visual-proof',
        sourceSha: SOURCE_SHA,
        status: 'passed',
        summary: 'Variant A proof video captured the item-specific state.',
        variantId: 'variant-a',
      },
    ],
    operational: {},
    requiredVariants: [
      {
        id: 'variant-a',
        label: 'Registry card with proof video',
        proof: receipt('required_variants', 'variant-a-proof'),
        requiredMediaIds: ['variant-a-proof-video'],
        sourceSha: SOURCE_SHA,
      },
    ],
    source: {
      digest:
        'sha256:source0000000000000000000000000000000000000000000000000000',
      expectedSha: SOURCE_SHA,
      paths: ['apps/web/lib/agent-os/certification.ts'],
      ref: 'refs/heads/tim/jov-5753',
      repository: 'JovieInc/Jovie',
      sha: SOURCE_SHA,
    },
    subject: {
      id: 'feature-proof-library',
      kind: 'ovie-registry-projection',
      title: 'Feature Proof Library',
    },
    testsCoverage: [receipt('tests_coverage', 'focused-vitest-coverage')],
    visualProof: [receipt('visual_proof', 'item-specific-visual-proof')],
    ...overrides,
  };
}
function approve(packet: CertificationReviewPacket) {
  const recorded = recordFounderCertificationDecision({
    decision: {
      decision: 'approved',
      id: 'decision-1',
      evidenceDigest: buildCertificationDecisionDigest(packet),
      notes: null,
      reviewer: 'founder',
    },
    packet,
  });
  expect(recorded.ok).toBe(true);
  if (!recorded.ok) throw new Error('expected approval to record');
  return recorded.decision;
}
describe('certification admission kernel', () => {
  it.each([undefined, '', 'sha256:stale-review'])(
    'rejects founder approval without the exact reviewed digest (%s)',
    evidenceDigest => {
      const packet = reviewPacket();
      const result = recordFounderCertificationDecision({
        packet,
        decision: {
          decision: 'approved',
          id: 'unbound-decision',
          notes: null,
          reviewer: 'founder',
          evidenceDigest: evidenceDigest as string,
        },
      });
      expect(result.ok).toBe(false);
      if (result.ok) throw new Error('unbound approval must fail');
      expect(result.reason).toBe('decision_digest_mismatch');
      expect(result.admission.state).toBe('review_ready');
    }
  );
  it('rejects a previously displayed digest when the evidence packet changes', () => {
    const displayed = reviewPacket();
    const evidenceDigest = buildCertificationDecisionDigest(displayed);
    const packet = reviewPacket({
      testsCoverage: [
        {
          ...receipt('tests_coverage', 'changed-coverage'),
          summary: 'Updated test outcome',
        },
      ],
    });
    const result = recordFounderCertificationDecision({
      packet,
      decision: {
        decision: 'approved',
        id: 'stale-review',
        notes: null,
        reviewer: 'founder',
        evidenceDigest,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('stale review must fail');
    expect(result.reason).toBe('decision_digest_mismatch');
  });

  it.each(['', 'not-a-commit', 'a'.repeat(39), 'g'.repeat(40)])(
    'rejects malformed source identity %s',
    sha => {
      const packet = reviewPacket();
      if (!packet.source) throw new Error('missing fixture source');
      const admission = evaluateCertificationAdmission({
        packet: {
          ...packet,
          source: { ...packet.source, sha, expectedSha: sha },
        },
      });
      expect(admission.state).toBe('working');
      expect(admission.blockers.map(item => item.code)).toContain(
        'source_missing'
      );
    }
  );

  it.each([
    'canonicalReferences',
    'invariantEvaluation',
    'testsCoverage',
    'visualProof',
  ] as const)('rejects unbound or unusable %s receipts', group => {
    for (const invalid of [
      { sourceSha: null },
      { sourceSha: '' },
      { ref: ' ' },
      { digest: null },
      { digest: ' ' },
    ]) {
      const packet = reviewPacket();
      const admission = evaluateCertificationAdmission({
        packet: { ...packet, [group]: [{ ...packet[group][0], ...invalid }] },
      });
      expect(admission.state).toBe('working');
      expect(admission.tasteInboxCard).toBeNull();
      expect(admission.blockers.length).toBeGreaterThan(0);
    }
  });

  it('rejects unbound required variant and media evidence', () => {
    const packet = reviewPacket();
    const variant = packet.requiredVariants[0];
    if (!variant.proof) throw new Error('missing fixture proof');
    for (const invalid of [
      { sourceSha: null },
      { ref: '' },
      { digest: null },
    ]) {
      const proofResult = evaluateCertificationAdmission({
        packet: {
          ...packet,
          requiredVariants: [
            { ...variant, proof: { ...variant.proof, ...invalid } },
          ],
        },
      });
      const mediaResult = evaluateCertificationAdmission({
        packet: {
          ...packet,
          itemMedia: [{ ...packet.itemMedia[0], ...invalid }],
        },
      });
      expect(proofResult.state).toBe('working');
      expect(mediaResult.state).toBe('working');
    }
  });

  it.each(['ci', 'queueMerge', 'deploy', 'runtimeDogfood'] as const)(
    'rejects unbound %s operational proof',
    group => {
      const packet = reviewPacket();
      const decision = approve(packet);
      const operational = {
        ci: [receipt('ci')],
        queueMerge: [receipt('queue_merge')],
        deploy: [receipt('deploy')],
        runtimeDogfood: [receipt('runtime_dogfood')],
      };
      const admission = evaluateCertificationAdmission({
        packet: {
          ...packet,
          operational: {
            ...operational,
            [group]: [{ ...operational[group][0], sourceSha: null }],
          },
        },
        decisions: [decision],
        requestedState: 'monitored',
      });
      expect(admission.transition.allowed).toBe(false);
      expect(admission.transition.blockers.map(item => item.code)).toContain(
        `${operational[group][0].tier}_failed`
      );
    }
  );

  it('emits one Taste Inbox card only when a review packet is complete', () => {
    const packet = reviewPacket();
    const admission = evaluateCertificationAdmission({ packet });
    expect(admission.state).toBe('review_ready');
    expect(admission.tasteInboxCard).toEqual({
      contract: 'jovie.certification/v1',
      decisionEvidenceDigest: admission.decisionEvidenceDigest,
      excludedOperationalTiers: [
        'ci',
        'queue_merge',
        'deploy',
        'runtime_dogfood',
      ],
      state: 'review_ready',
      subject: packet.subject,
    });
    const nonReviewStates: CertificationState[] = [
      'working',
      'founder_locked',
      'shipped',
      'monitored',
    ];
    expect(nonReviewStates.filter(shouldEmitTasteInboxCard)).toEqual([]);
  });
  it('fails closed for incomplete review packets even when operational receipts passed', () => {
    const admission = evaluateCertificationAdmission({
      packet: reviewPacket({
        canonicalReferences: [],
        invariantEvaluation: [],
        testsCoverage: [],
        visualProof: [],
        operational: {
          ci: [receipt('ci', 'ci-green')],
          deploy: [receipt('deploy', 'deploy-green')],
          queueMerge: [receipt('queue_merge', 'merged')],
          runtimeDogfood: [receipt('runtime_dogfood', 'dogfood-green')],
        },
      }),
    });
    expect(admission.state).toBe('working');
    expect(admission.tasteInboxCard).toBeNull();
    expect(admission.blockers.map(blocker => blocker.tier)).toEqual(
      expect.arrayContaining([
        'canonical_references',
        'invariant_evaluation',
        'tests_coverage',
        'visual_proof',
      ])
    );
  });

  it('does not accept operational receipts as taste evidence', () => {
    const admission = evaluateCertificationAdmission({
      packet: reviewPacket({
        testsCoverage: [receipt('ci', 'ci-as-tests-coverage')],
        visualProof: [receipt('deploy', 'deploy-as-visual-proof')],
      }),
    });

    expect(admission.state).toBe('working');
    expect(admission.tasteInboxCard).toBeNull();
    expect(admission.blockers.map(blocker => blocker.code)).toEqual(
      expect.arrayContaining(['tests_coverage_failed', 'visual_proof_failed'])
    );
  });

  it('fails closed when required variant proof or item-specific media is missing', () => {
    const admission = evaluateCertificationAdmission({
      packet: reviewPacket({
        itemMedia: [],
        requiredVariants: [
          {
            id: 'variant-a',
            label: 'Registry card with proof video',
            proof: null,
            requiredMediaIds: ['variant-a-proof-video'],
            sourceSha: SOURCE_SHA,
          },
        ],
      }),
    });
    expect(admission.state).toBe('working');
    expect(admission.blockers.map(blocker => blocker.code)).toEqual(
      expect.arrayContaining([
        'required_variant_missing',
        'required_media_missing',
      ])
    );
  });
  it('fails closed for stale or mismatched source SHA evidence', () => {
    const admission = evaluateCertificationAdmission({
      packet: reviewPacket({
        source: {
          digest:
            'sha256:source0000000000000000000000000000000000000000000000000000',
          expectedSha: CHANGED_SHA,
          paths: ['apps/web/lib/agent-os/certification.ts'],
          ref: 'refs/heads/tim/jov-5753',
          repository: 'JovieInc/Jovie',
          sha: SOURCE_SHA,
        },
        testsCoverage: [
          receipt('tests_coverage', 'coverage-from-stale-source', CHANGED_SHA),
        ],
      }),
    });
    expect(admission.state).toBe('working');
    expect(admission.blockers.map(blocker => blocker.code)).toEqual(
      expect.arrayContaining([
        'source_sha_mismatch',
        'evidence_source_sha_mismatch',
      ])
    );
  });
  it('rejects duplicate or replayed founder decisions for the same evidence digest', () => {
    const packet = reviewPacket();
    const first = approve(packet);
    const replay = recordFounderCertificationDecision({
      decision: {
        decision: 'approved',
        id: 'decision-2',
        evidenceDigest: buildCertificationDecisionDigest(packet),
        notes: null,
        reviewer: 'founder',
      },
      existingDecisions: [first],
      packet,
    });
    const admission = evaluateCertificationAdmission({
      decisions: [first, { ...first, id: 'decision-duplicate' }],
      packet,
    });
    expect(replay.ok).toBe(false);
    if (replay.ok) throw new Error('expected replay to fail');
    expect(replay.reason).toBe('duplicate_founder_decision');
    expect(admission.state).toBe('working');
    expect(admission.blockers.map(blocker => blocker.code)).toContain(
      'duplicate_founder_decision'
    );
  });
  it('invalidates stale founder locks when taste evidence changes', () => {
    const packet = reviewPacket();
    const lockedDecision = approve(packet);
    const changedPacket = reviewPacket({
      canonicalReferences: [
        {
          ...receipt('canonical_references', 'design-canon-reference'),
          digest:
            'sha256:changed00000000000000000000000000000000000000000000000000',
        },
      ],
    });
    const admission = evaluateCertificationAdmission({
      decisions: [lockedDecision],
      packet: changedPacket,
    });
    expect(admission.state).toBe('review_ready');
    expect(admission.staleFounderLock).toEqual(lockedDecision);
    expect(admission.tasteInboxCard?.decisionEvidenceDigest).not.toBe(
      lockedDecision.evidenceDigest
    );
  });
  it('keeps a valid taste decision when only same-source operational progress changes', () => {
    const packet = reviewPacket();
    const decisionDigest = buildCertificationDecisionDigest(packet);
    const lockedDecision = approve(packet);
    const progressedPacket = reviewPacket({
      operational: {
        ci: [receipt('ci', 'ci-green')],
        deploy: [receipt('deploy', 'deploy-green')],
        queueMerge: [receipt('queue_merge', 'merged')],
        runtimeDogfood: [receipt('runtime_dogfood', 'dogfood-green')],
      },
    });
    const progressedDigest = buildCertificationDecisionDigest(progressedPacket);
    const admission = evaluateCertificationAdmission({
      decisions: [lockedDecision],
      packet: progressedPacket,
    });
    expect(progressedDigest).toBe(decisionDigest);
    expect(admission.state).toBe('monitored');
    expect(admission.currentDecision).toEqual(lockedDecision);
  });
  it('blocks premature shipped and monitored transitions', () => {
    const packet = reviewPacket();
    const lockedDecision = approve(packet);
    const shippedAttempt = evaluateCertificationAdmission({
      decisions: [lockedDecision],
      packet,
      requestedState: 'shipped',
    });
    const monitoredAttempt = evaluateCertificationAdmission({
      decisions: [lockedDecision],
      packet: reviewPacket({
        operational: {
          ci: [receipt('ci', 'ci-green')],
          deploy: [receipt('deploy', 'deploy-green')],
          queueMerge: [receipt('queue_merge', 'merged')],
        },
      }),
      requestedState: 'monitored',
    });
    expect(shippedAttempt.state).toBe('founder_locked');
    expect(shippedAttempt.transition.allowed).toBe(false);
    expect(
      shippedAttempt.transition.blockers.map(blocker => blocker.code)
    ).toEqual(
      expect.arrayContaining([
        'ci_missing',
        'queue_merge_missing',
        'deploy_missing',
      ])
    );
    expect(monitoredAttempt.state).toBe('shipped');
    expect(monitoredAttempt.transition.allowed).toBe(false);
    expect(
      monitoredAttempt.transition.blockers.map(blocker => blocker.code)
    ).toContain('runtime_dogfood_missing');
  });
  it('does not treat approval as merge, deploy, or runtime proof', () => {
    const packet = reviewPacket();
    const lockedDecision = approve(packet);
    const admission = evaluateCertificationAdmission({
      decisions: [lockedDecision],
      packet,
    });
    expect(admission.state).toBe('founder_locked');
    expect(admission.tasteInboxCard).toBeNull();
  });
  it('returns feedback and rejection to working with audit history intact', () => {
    const feedback = recordFounderCertificationDecision({
      decision: {
        decision: 'changes_requested',
        id: 'decision-feedback',
        evidenceDigest: buildCertificationDecisionDigest(reviewPacket()),
        notes: 'Tighten item-specific media.',
        reviewer: 'founder',
      },
      packet: reviewPacket(),
    });
    expect(feedback.ok).toBe(true);
    if (!feedback.ok) throw new Error('expected feedback to record');
    expect(feedback.admission.state).toBe('working');
    expect(feedback.decisions).toHaveLength(1);
    expect(feedback.admission.auditHistory.map(event => event.type)).toContain(
      'founder_feedback_returned'
    );
    const rejectionPacket = reviewPacket({
      subject: {
        id: 'another-feature',
        kind: 'ovie-registry-projection',
        title: 'Another feature',
      },
    });
    const rejection = recordFounderCertificationDecision({
      decision: {
        decision: 'rejected',
        id: 'decision-reject',
        evidenceDigest: buildCertificationDecisionDigest(rejectionPacket),
        notes: 'Wrong source behavior.',
        reviewer: 'founder',
      },
      packet: rejectionPacket,
    });
    expect(rejection.ok).toBe(true);
    if (!rejection.ok) throw new Error('expected rejection to record');
    expect(rejection.admission.state).toBe('working');
    expect(rejection.admission.auditHistory.map(event => event.type)).toContain(
      'founder_rejected'
    );
  });
});

describe('first-human design baseline routing (JOV-6947)', () => {
  function approveWithAuthority(
    packet: CertificationReviewPacket,
    overrides: {
      readonly certifierAuthority?: 'human' | 'machine';
      readonly id?: string;
      readonly reviewer?: string;
      readonly existingDecisions?: readonly ReturnType<typeof approve>[];
    } = {}
  ) {
    const recorded = recordFounderCertificationDecision({
      decision: {
        certifierAuthority: overrides.certifierAuthority,
        decision: 'approved',
        evidenceDigest: buildCertificationDecisionDigest(packet),
        id: overrides.id ?? 'decision-1',
        notes: null,
        reviewer:
          overrides.reviewer ??
          (overrides.certifierAuthority === 'machine'
            ? 'design-ci-machine-ensemble@v1'
            : 'founder'),
      },
      existingDecisions: overrides.existingDecisions ?? [],
      packet,
    });
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) throw new Error('expected approval to record');
    return recorded.decision;
  }
  const fullOperationalEvidence = {
    ci: [receipt('ci', 'ci-green')],
    deploy: [receipt('deploy', 'deploy-green')],
    queueMerge: [receipt('queue_merge', 'merged')],
    runtimeDogfood: [receipt('runtime_dogfood', 'dogfood-green')],
  };

  it('reports never_human_certified for a blocked or awaiting-review subject', () => {
    const blocked = evaluateCertificationAdmission({
      packet: reviewPacket({ canonicalReferences: [] }),
    });
    expect(blocked.state).toBe('working');
    expect(blocked.baselineStatus).toBe('never_human_certified');
    expect(blocked.founderBaseline).toBeNull();

    const awaitingReview = evaluateCertificationAdmission({
      packet: reviewPacket(),
    });
    expect(awaitingReview.state).toBe('review_ready');
    expect(awaitingReview.baselineStatus).toBe('never_human_certified');
    expect(awaitingReview.founderBaseline).toBeNull();
  });

  it('lets a never-certified subject ship on machine authority alone, without ever calling it human-certified', () => {
    const packet = reviewPacket({ operational: fullOperationalEvidence });
    const machineApproval = approveWithAuthority(packet, {
      certifierAuthority: 'machine',
    });
    const admission = evaluateCertificationAdmission({
      decisions: [machineApproval],
      packet,
    });
    expect(admission.state).toBe('monitored');
    expect(admission.baselineStatus).toBe('machine_certified_live');
    expect(admission.founderBaseline).toBeNull();
  });

  it('establishes the protected baseline on the first human approval', () => {
    const packet = reviewPacket();
    const founderApproval = approveWithAuthority(packet);
    const admission = evaluateCertificationAdmission({
      decisions: [founderApproval],
      packet,
    });
    expect(admission.baselineStatus).toBe('human_certified_baseline');
    expect(admission.founderBaseline).toEqual(founderApproval);
  });

  it('treats new evidence against an established baseline as a candidate pending recertification, not a fresh unblocked start', () => {
    const packet = reviewPacket();
    const founderApproval = approveWithAuthority(packet);
    const changedPacket = reviewPacket({
      canonicalReferences: [
        {
          ...receipt('canonical_references', 'design-canon-reference'),
          digest:
            'sha256:changed00000000000000000000000000000000000000000000000000',
        },
      ],
    });
    const admission = evaluateCertificationAdmission({
      decisions: [founderApproval],
      packet: changedPacket,
    });
    expect(admission.state).toBe('review_ready');
    expect(admission.baselineStatus).toBe('candidate_pending_recertification');
    expect(admission.founderBaseline).toEqual(founderApproval);
  });

  it('lets a founder replace an existing baseline with a fresh approval', () => {
    const packet = reviewPacket();
    const originalApproval = approveWithAuthority(packet);
    const changedPacket = reviewPacket({
      canonicalReferences: [
        {
          ...receipt('canonical_references', 'design-canon-reference'),
          digest:
            'sha256:changed00000000000000000000000000000000000000000000000000',
        },
      ],
    });
    const replacementApproval = approveWithAuthority(changedPacket, {
      existingDecisions: [originalApproval],
      id: 'decision-2',
    });
    const admission = evaluateCertificationAdmission({
      decisions: [originalApproval, replacementApproval],
      packet: changedPacket,
    });
    expect(admission.baselineStatus).toBe('human_certified_baseline');
    expect(admission.founderBaseline).toEqual(replacementApproval);
  });

  it('does not let a machine approval reinterpret an established human baseline as machine-certified', () => {
    const packet = reviewPacket();
    const founderApproval = approveWithAuthority(packet);
    const changedPacket = reviewPacket({
      operational: fullOperationalEvidence,
      canonicalReferences: [
        {
          ...receipt('canonical_references', 'design-canon-reference'),
          digest:
            'sha256:changed00000000000000000000000000000000000000000000000000',
        },
      ],
    });
    const machineApproval = approveWithAuthority(changedPacket, {
      certifierAuthority: 'machine',
      existingDecisions: [founderApproval],
      id: 'decision-2',
    });
    const admission = evaluateCertificationAdmission({
      decisions: [founderApproval, machineApproval],
      packet: changedPacket,
    });
    // The machine decision still moves shipping forward under existing rules...
    expect(admission.state).toBe('monitored');
    // ...but the registry keeps the founder's prior baseline as protected,
    // and never relabels this machine pass as the human baseline.
    expect(admission.baselineStatus).toBe('candidate_pending_recertification');
    expect(admission.founderBaseline).toEqual(founderApproval);
  });
});

describe('certification decision digest', () => {
  it('is byte-stable across the isomorphic sha256 implementation', () => {
    // Golden captured from the node:crypto implementation; stored founder
    // decisions bind to this digest, so the value must never drift.
    expect(buildCertificationDecisionDigest(reviewPacket())).toBe(
      'sha256:6cc6a0e660a8b4b83a3cf732826cb9b25d498282b9fdef689995c9d19a3cb112'
    );
  });
});
