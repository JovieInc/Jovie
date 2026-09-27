import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDesignSystemReviewItems,
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

    expect(items.every(item => item.media.length > 0)).toBe(true);
    expect(items.every(item => item.media[0]?.src.startsWith('/'))).toBe(true);
    expect(items.some(item => item.scope === 'capability')).toBe(true);
    expect(items.find(item => item.title === 'Delete a contact')).toMatchObject(
      {
        scope: 'behavior',
        readiness: 'collecting',
        status: 'Implemented',
      }
    );
    expect(items.some(item => item.readiness === 'ready')).toBe(true);
    expect(
      items.find(item => item.title === 'Unlimited smart links')
    ).toMatchObject({
      readiness: 'collecting',
      media: [{ dedicated: false }],
    });
    const readyItems = items.filter(item => item.readiness === 'ready');
    expect(new Set(readyItems.map(item => item.title))).toEqual(
      new Set([
        'Release pages with listen links per DSP',
        'Smart link editing and customization',
        'Spotify pre-save campaigns',
        'Public profile pages',
        'Subscribe / follow page',
        'Contact page',
        'Tour dates (Bandsintown)',
        'Latest release card on profile',
        'Advanced analytics and geo insights',
      ])
    );
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
    expect(ready).toBeDefined();
    expect(collecting).toBeDefined();
    if (!ready || !collecting) return;

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
    expect(item).toBeDefined();
    if (!item) return;

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
    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;

    // A media swap mints a new source fingerprint and a new digest; the prior
    // approved decision becomes a stale founder lock.
    const tamperedPacket = {
      ...item.certificationPacket,
      itemMedia: item.certificationPacket.itemMedia.map(media => ({
        ...media,
        ref: '/changed-evidence.png',
      })),
    };
    const tamperedAdmission = evaluateCertificationAdmission({
      packet: tamperedPacket,
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

  it('projects every canonical design component with media and keeps incomplete proof blocked', () => {
    const items = buildDesignSystemReviewItems();
    const registrySize = items.length;

    expect(registrySize).toBeGreaterThanOrEqual(11);
    expect(items.every(item => item.scope === 'component')).toBe(true);
    expect(items.every(item => item.media.length > 0)).toBe(true);
    expect(items.find(item => item.title === 'Button')?.readiness).toBe(
      'ready'
    );
    expect(items.find(item => item.title === 'IconButton')?.readiness).toBe(
      'collecting'
    );
    // Components without a proven Pen binding fail the required_variants tier.
    expect(
      evaluateCertificationAdmission({
        packet: items.find(item => item.title === 'Input')
          ?.certificationPacket as never,
      }).blockers.map(blocker => blocker.code)
    ).toContain('required_variant_missing');
  });
});
