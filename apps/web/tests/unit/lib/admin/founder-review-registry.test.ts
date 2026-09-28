import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assert, describe, expect, it } from 'vitest';
import {
  buildFeatureReviewItems,
  parseFeatureRegistryMarkdown,
} from '@/lib/admin/founder-review-registry';
import {
  buildCertificationDecisionDigest,
  evaluateCertificationAdmission,
  JOVIE_CERTIFICATION_CONTRACT,
  recordFounderCertificationDecision,
} from '@/lib/agent-os/certification';

const FEATURE_REGISTRY = readFileSync(
  resolve(process.cwd(), '../../docs/FEATURE_REGISTRY.md'),
  'utf8'
);

describe('founder review registries', () => {
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
    expect(items.some(item => item.readiness === 'ready')).toBe(true);
    expect(
      items.find(item => item.title === 'Unlimited smart links')
    ).toMatchObject({
      readiness: 'collecting',
      media: [{ dedicated: false }],
    });

    const readyItems = items.filter(item => item.readiness === 'ready');
    expect(
      readyItems.map(item => [item.title, item.media[0]?.src])
    ).toMatchSnapshot();
    expect(
      readyItems.every(
        item =>
          item.status.startsWith('Shipped') && item.media[0]?.dedicated === true
      )
    ).toBe(true);
    expect(new Set(readyItems.map(item => item.media[0]?.src)).size).toBe(
      readyItems.length
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
    const ready = items.find(item => item.readiness === 'ready');
    const collecting = items.find(item => item.readiness === 'collecting');
    assert(ready && collecting);

    expect(ready.certificationPacket.contract).toBe(
      JOVIE_CERTIFICATION_CONTRACT
    );
    expect(ready.decisionEvidenceDigest).toBe(
      buildCertificationDecisionDigest(ready.certificationPacket)
    );
    expect(ready.certificationState).toBe('review_ready');
    expect(
      evaluateCertificationAdmission({ packet: ready.certificationPacket })
        .tasteInboxCard
    ).not.toBeNull();

    const collectingAdmission = evaluateCertificationAdmission({
      packet: collecting.certificationPacket,
    });
    expect(collectingAdmission.state).toBe('working');
    expect(collectingAdmission.blockers.length).toBeGreaterThan(0);
    expect(collecting.readinessReason).toContain(
      collectingAdmission.blockers[0]?.summary ?? ''
    );
  });

  it('invalidates a founder decision when any packet evidence changes', () => {
    const item = buildFeatureReviewItems(FEATURE_REGISTRY).find(
      candidate => candidate.readiness === 'ready'
    );
    assert(item);

    const recorded = recordFounderCertificationDecision({
      packet: item.certificationPacket,
      decision: {
        id: 'decision-1',
        decision: 'approved',
        reviewer: 'founder',
        notes: null,
        evidenceDigest: item.decisionEvidenceDigest,
      },
    });
    assert(recorded.ok);

    // A media swap mints a new source fingerprint and a new digest; the prior
    // approved decision becomes a stale founder lock.
    const tamperedAdmission = evaluateCertificationAdmission({
      packet: {
        ...item.certificationPacket,
        itemMedia: item.certificationPacket.itemMedia.map(media => ({
          ...media,
          ref: '/changed-evidence.png',
        })),
      },
      decisions: recorded.decisions,
    });
    expect(tamperedAdmission.decisionEvidenceDigest).not.toBe(
      item.decisionEvidenceDigest
    );
    expect(tamperedAdmission.staleFounderLock?.id).toBe('decision-1');
    expect(
      tamperedAdmission.auditHistory.some(
        event => event.type === 'founder_lock_stale'
      )
    ).toBe(true);
  });
});
