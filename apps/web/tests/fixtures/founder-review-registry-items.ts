import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import { fixtureRow } from '@/lib/ovie/certifications/fixtures';
import type { OvieCertificationRow } from '@/lib/ovie/certifications/types';
import { founderReviewItemFixture } from '@/tests/fixtures/founder-review-item';

export const items: readonly FounderReviewItem[] = [
  founderReviewItemFixture({
    id: 'feature.ready',
    title: 'Ready feature',
    readiness: 'ready',
    media: [
      {
        kind: 'image',
        src: '/product-screenshots/release-landing-desktop.png',
        alt: 'Ready feature evidence',
        label: 'Dedicated product capture',
        dedicated: true,
      },
    ],
  }),
  founderReviewItemFixture({
    id: 'feature.contacts.delete-contact',
    title: 'Delete a contact',
    eyebrow: 'Contacts',
    scope: 'behavior',
    description: 'Remove an owned contact after confirmation.',
    status: 'Implemented',
    access: 'Authenticated creator',
    source: 'contacts/actions.ts#deleteContact',
    gate: 'Destructive confirmation',
    readiness: 'collecting',
    readinessReason: 'A dedicated end-to-end capture is still required.',
    media: [
      {
        kind: 'image',
        src: '/product-screenshots/audience-crm.png',
        alt: 'Contact workspace context',
        label: 'Contact workspace context',
        dedicated: false,
      },
    ],
  }),
];

/** Server-side certification row projection for one registry item. */
export function registryRow(
  item: FounderReviewItem,
  overrides: Partial<OvieCertificationRow['decision']> = {}
): OvieCertificationRow {
  const reviewReady = item.readiness === 'ready' && !('available' in overrides);
  return {
    ...fixtureRow(item.id, {
      domain: 'feature_registry',
      surface: 'Feature Capability',
    }),
    id: `feature_registry:${item.id}`,
    domain: 'feature_registry',
    surface: 'Feature Capability',
    subject: { id: item.id, kind: 'feature', title: item.title },
    state: reviewReady ? 'review_ready' : 'working',
    evidence: [],
    blockers: [],
    staleFounderLock: false,
    updatedAt: '2026-10-02T00:00:00.000Z',
    links: [],
    history: [],
    decision: {
      available: reviewReady,
      reason: reviewReady ? null : 'Evidence is incomplete: 1 blocker.',
      evidenceDigest: item.decisionEvidenceDigest,
      currentDecision: null,
      ...overrides,
    },
    source: null,
  };
}
