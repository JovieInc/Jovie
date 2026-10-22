import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assert, describe, expect, it } from 'vitest';
import {
  buildFeatureReviewItems,
  parseFeatureRegistryMarkdown,
} from '@/lib/admin/founder-review-registry';
import {
  buildCertificationDecisionDigest,
  type CertificationReviewPacket,
  evaluateCertificationAdmission,
  JOVIE_CERTIFICATION_CONTRACT,
  recordFounderCertificationDecision,
} from '@/lib/agent-os/certification';
import { projectCertificationInbox } from '@/lib/agent-os/certification-inbox';
import { normalizeKernelCertificationRow } from '@/lib/ovie/certifications/normalize';

const FEATURE_REGISTRY = readFileSync(
  resolve(process.cwd(), '../../docs/FEATURE_REGISTRY.md'),
  'utf8'
);

/** Complete unit-test packet only: these fixtures do not certify registry content. */
function packetWithMachineReceiptFixtures(): CertificationReviewPacket {
  const item = buildFeatureReviewItems(FEATURE_REGISTRY).find(
    item => item.id === 'feature.analytics.advanced-analytics-and-geo-insights'
  );
  assert(item?.certificationPacket.source);
  const packet = item.certificationPacket;
  const sourceSha = item.certificationPacket.source.sha;
  const fixture = (tier: 'invariant_evaluation' | 'tests_coverage') => ({
    id: `unit-fixture-${tier}`,
    tier,
    status: 'passed' as const,
    sourceSha,
    ref: `fixture:${tier}`,
    digest: `sha256:${'a'.repeat(64)}`,
    summary: `Unit-test fixture for ${tier}`,
  });
  return {
    ...packet,
    invariantEvaluation: [fixture('invariant_evaluation')],
    testsCoverage: [fixture('tests_coverage')],
  };
}

describe('founder review registries', () => {
  it.each(['None', 'advanced_analytics_feature'])(
    'does not manufacture invariant or test receipts from shipped registry metadata (%s)',
    gate => {
      const markdown = [
        '## Product Feature List',
        '| Product area | Feature | Status | Access model | Flag/gate | Notes |',
        '| --- | --- | --- | --- | --- | --- |',
        `| Analytics | Advanced analytics and geo insights | Shipped | Pro+ | ${gate} | Entitlement-backed (canAccessAdvancedAnalytics) |`,
      ].join('\n');
      const item = buildFeatureReviewItems(markdown).find(
        item =>
          item.id === 'feature.analytics.advanced-analytics-and-geo-insights'
      );
      assert(item);
      expect(item.status).toBe('Shipped');
      expect(item.media[0]?.dedicated).toBe(true);
      expect(item.certificationPacket.canonicalReferences).toHaveLength(1);
      expect(item.certificationPacket.invariantEvaluation).toEqual([]);
      expect(item.certificationPacket.testsCoverage).toEqual([]);
      expect(item.certificationState).toBe('working');
      expect(item.readiness).toBe('collecting');
      expect(
        evaluateCertificationAdmission({ packet: item.certificationPacket })
          .tasteInboxCard
      ).toBeNull();
      expect(
        recordFounderCertificationDecision({
          packet: item.certificationPacket,
          decision: {
            id: 'unit-only-decision',
            decision: 'approved',
            reviewer: 'unit-fixture',
            notes: null,
            evidenceDigest: item.decisionEvidenceDigest,
          },
        })
      ).toMatchObject({ ok: false, reason: 'packet_not_review_ready' });
    }
  );

  it('parses only the canonical product-feature table', () => {
    const rows = parseFeatureRegistryMarkdown(FEATURE_REGISTRY);

    expect(rows.length).toBeGreaterThan(40);
    expect(rows[0]).toMatchObject({
      productArea: 'Smart Links',
      feature: 'Unlimited smart links',
      status: 'Shipped',
    });
    expect(rows.some(row => row.feature === 'homepage_hero')).toBe(false);
  });

  it('attaches visual media to every feature while admitting only honest ready packets', () => {
    const items = buildFeatureReviewItems(FEATURE_REGISTRY);

    expect(items.every(item => item.media[0]?.src.startsWith('/'))).toBe(true);
    expect(items.some(item => item.scope === 'capability')).toBe(true);
    expect(items.find(item => item.title === 'Delete a contact')).toMatchObject(
      { scope: 'behavior', readiness: 'collecting', status: 'Implemented' }
    );
    expect(items.every(item => item.readiness === 'collecting')).toBe(true);
    expect(
      items.find(item => item.title === 'Unlimited smart links')
    ).toMatchObject({
      readiness: 'collecting',
      media: [{ dedicated: false }],
    });

    const capturedItems = items.filter(item => item.media[0]?.dedicated);
    expect(
      capturedItems.map(item => [item.title, item.media[0]?.src])
    ).toMatchSnapshot();
    expect(
      capturedItems.every(
        item =>
          item.status.startsWith('Shipped') && item.media[0]?.dedicated === true
      )
    ).toBe(true);
    expect(new Set(capturedItems.map(item => item.media[0]?.src)).size).toBe(
      capturedItems.length
    );

    // Earnings stays evidence-gated: the audience CRM capture is context only.
    expect(
      items.find(item => item.title === 'Earnings dashboard')
    ).toMatchObject({
      readiness: 'collecting',
      media: [{ dedicated: false }],
    });
  });

  it('binds readiness and decisions to the JOV-5753 certification kernel', () => {
    const items = buildFeatureReviewItems(FEATURE_REGISTRY);
    const collecting = items.find(item => item.readiness === 'collecting');
    assert(collecting);
    expect(collecting.certificationPacket.contract).toBe(
      JOVIE_CERTIFICATION_CONTRACT
    );
    expect(collecting.decisionEvidenceDigest).toBe(
      buildCertificationDecisionDigest(collecting.certificationPacket)
    );

    // Preserve the existing stage policy: complete taste evidence may be
    // review-ready before operational CI/merge/deploy/dogfood receipts exist.
    const completePacket = packetWithMachineReceiptFixtures();
    expect(completePacket.operational).toBeUndefined();
    const completeAdmission = evaluateCertificationAdmission({
      packet: completePacket,
    });
    expect(completeAdmission.state).toBe('review_ready');
    expect(completeAdmission.tasteInboxCard).not.toBeNull();

    const collectingAdmission = evaluateCertificationAdmission({
      packet: collecting.certificationPacket,
    });
    expect(collectingAdmission.state).toBe('working');
    expect(collectingAdmission.blockers.length).toBeGreaterThan(0);
    expect(collecting.readinessReason).toContain(
      collectingAdmission.blockers[0]?.summary ?? ''
    );
  });

  it('keeps the reference-only analytics item catalogued as working outside the founder queue', () => {
    const item = buildFeatureReviewItems(FEATURE_REGISTRY).find(
      item =>
        item.id === 'feature.analytics.advanced-analytics-and-geo-insights'
    );
    assert(item);
    const packet = item.certificationPacket;
    const admission = evaluateCertificationAdmission({ packet });
    const row = normalizeKernelCertificationRow({
      domain: 'feature_registry',
      surface: 'Feature Capability',
      packet,
      admission,
      decisions: [],
      auditHistory: [],
      updatedAt: '2026-10-22T16:30:00.000Z',
    });
    expect(row.subject.title).toBe('Advanced analytics and geo insights');
    expect(row.state).toBe('working');
    expect(row.tiers.invariant_evaluation).toBe('missing');
    expect(row.tiers.tests_coverage).toBe('missing');
    expect(row.decision.available).toBe(false);
    expect(row.blockers.map(blocker => blocker.tier)).toEqual(
      expect.arrayContaining(['invariant_evaluation', 'tests_coverage'])
    );
    const queue = projectCertificationInbox([
      {
        domain: 'feature_registry',
        packet,
        admission,
        observedAt: '2026-10-22T16:30:00.000Z',
      },
    ]);
    expect(queue.needsYou).toHaveLength(0);
    expect(queue.blocked).toHaveLength(1);
    expect(queue.blocked[0]?.actions).toEqual([]);
  });

  it('invalidates a founder decision when any packet evidence changes', () => {
    const packet = packetWithMachineReceiptFixtures();
    const evidenceDigest = buildCertificationDecisionDigest(packet);
    const recorded = recordFounderCertificationDecision({
      packet,
      decision: {
        id: 'decision-1',
        decision: 'approved',
        reviewer: 'founder',
        notes: null,
        evidenceDigest,
      },
    });
    assert(recorded.ok);

    // A media swap mints a new source fingerprint and a new digest; the prior
    // approved decision becomes a stale founder lock.
    const tamperedAdmission = evaluateCertificationAdmission({
      packet: {
        ...packet,
        itemMedia: packet.itemMedia.map(media => ({
          ...media,
          ref: '/changed-evidence.png',
        })),
      },
      decisions: recorded.decisions,
    });
    expect(tamperedAdmission.decisionEvidenceDigest).not.toBe(evidenceDigest);
    expect(tamperedAdmission.staleFounderLock?.id).toBe('decision-1');
    expect(
      tamperedAdmission.auditHistory.some(
        event => event.type === 'founder_lock_stale'
      )
    ).toBe(true);
  });
});
