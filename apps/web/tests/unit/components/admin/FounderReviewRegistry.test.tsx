import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FounderReviewRegistry } from '@/components/features/admin/FounderReviewRegistry';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import {
  buildCertificationDecisionDigest,
  JOVIE_CERTIFICATION_CONTRACT,
} from '@/lib/agent-os/certification';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

function itemFixture(
  overrides: Partial<FounderReviewItem> &
    Pick<FounderReviewItem, 'id' | 'title' | 'readiness'>
): FounderReviewItem {
  const certificationPacket = {
    contract: JOVIE_CERTIFICATION_CONTRACT,
    subject: {
      id: overrides.id,
      kind: 'feature' as const,
      title: overrides.title,
    },
    source: null,
    canonicalReferences: [],
    invariantEvaluation: [],
    testsCoverage: [],
    visualProof: [],
    requiredVariants: [],
    itemMedia: [],
  };
  return {
    registry: 'feature',
    eyebrow: 'Smart Links',
    scope: 'capability',
    description: 'A source-backed capability with dedicated evidence.',
    status: 'Shipped',
    access: 'Free+',
    source: 'docs/FEATURE_REGISTRY.md',
    gate: 'None',
    readinessReason: 'The review packet is complete.',
    evidence: ['Canonical feature registry', 'Dedicated product capture'],
    media: [
      {
        kind: 'image',
        src: '/product-screenshots/release-landing-desktop.png',
        alt: 'Ready feature evidence',
        label: 'Dedicated product capture',
        dedicated: true,
      },
    ],
    certificationPacket,
    decisionEvidenceDigest:
      buildCertificationDecisionDigest(certificationPacket),
    certificationState:
      overrides.readiness === 'ready' ? 'review_ready' : 'working',
    ...overrides,
  };
}

const items: readonly FounderReviewItem[] = [
  itemFixture({
    id: 'feature.ready',
    title: 'Ready feature',
    readiness: 'ready',
  }),
  itemFixture({
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
    evidence: ['Server action', 'Confirmation test'],
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

function MountedRightPanel() {
  const panel = useRightPanel();
  return <div data-testid='mounted-right-panel'>{panel}</div>;
}

function renderRegistry() {
  return render(
    <RightPanelProvider>
      <FounderReviewRegistry kind='feature' items={items} />
      <MountedRightPanel />
    </RightPanelProvider>
  );
}

describe('FounderReviewRegistry', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('uses the unified selectable table and mounts media-first certification details in the right rail', async () => {
    renderRegistry();

    expect(
      screen.getByRole('columnheader', { name: 'Registry Item' })
    ).toBeVisible();
    expect(screen.getByRole('columnheader', { name: 'Level' })).toBeVisible();
    expect(screen.getByRole('table')).toHaveClass(
      'system-b-founder-review-table'
    );
    expect(screen.getByText('Delete a contact')).toBeVisible();

    const rail = await screen.findByTestId('founder-review-detail-rail');
    const media = within(rail).getByTestId('founder-review-evidence-media');
    const details = within(rail).getByText('Certification details');
    expect(
      media.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(within(rail).getByAltText('Ready feature evidence')).toBeVisible();
    expect(within(rail).getByTestId('certify-review-item')).toBeEnabled();
  });

  it('persists a ready decision bound to the kernel evidence digest and blocks incomplete atomic behavior packets', async () => {
    const user = userEvent.setup();
    const readyItem = items.find(item => item.id === 'feature.ready');
    expect(readyItem).toBeDefined();
    if (!readyItem) return;
    renderRegistry();

    const rail = await screen.findByTestId('founder-review-detail-rail');
    await user.click(within(rail).getByTestId('certify-review-item'));

    await waitFor(() => {
      expect(
        JSON.parse(
          localStorage.getItem('ovie-founder-review-decisions-v1') ?? '{}'
        )
      ).toMatchObject({
        'feature.ready': {
          outcome: 'certified',
          evidenceDigest: readyItem.decisionEvidenceDigest,
        },
      });
    });

    await user.click(
      screen.getByTestId('founder-review-row-feature.contacts.delete-contact')
    );
    expect(
      within(await screen.findByTestId('founder-review-detail-rail')).getByText(
        'Behavior · Contacts'
      )
    ).toBeVisible();
    expect(
      within(screen.getByTestId('founder-review-detail-rail')).getByRole(
        'button',
        { name: 'Certify For Taste' }
      )
    ).toBeDisabled();
  });

  it('removes a local decision recorded against a stale evidence digest', async () => {
    localStorage.setItem(
      'ovie-founder-review-decisions-v1',
      JSON.stringify({
        'feature.ready': {
          outcome: 'certified',
          note: 'Old review',
          reviewedAt: '2026-08-30T12:00:00.000Z',
          evidenceDigest: 'sha256:stale',
        },
      })
    );

    renderRegistry();

    const readyRow = screen.getByTestId('founder-review-row-feature.ready');
    await waitFor(() => {
      expect(within(readyRow).getByText('Ready')).toBeVisible();
      expect(within(readyRow).queryByText('Certified')).toBeNull();
      expect(localStorage.getItem('ovie-founder-review-decisions-v1')).toBe(
        '{}'
      );
    });
  });
});
