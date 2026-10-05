import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FounderReviewRegistry } from '@/components/features/admin/FounderReviewRegistry';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import { founderReviewItemFixture } from '@/tests/fixtures/founder-review-item';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

const items: readonly FounderReviewItem[] = [
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

function MountedRightPanel() {
  const panel = useRightPanel();
  return <div data-testid='mounted-right-panel'>{panel}</div>;
}

function MountedHeaderActions() {
  const { headerActions } = useHeaderActions();
  return <div data-testid='mounted-header-actions'>{headerActions}</div>;
}

function renderRegistry() {
  return render(
    <HeaderActionsProvider>
      <RightPanelProvider>
        <MountedHeaderActions />
        <FounderReviewRegistry kind='feature' items={items} />
        <MountedRightPanel />
      </RightPanelProvider>
    </HeaderActionsProvider>
  );
}

describe('FounderReviewRegistry', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('uses the unified selectable table and mounts media-first certification details in the right rail', async () => {
    renderRegistry();

    const headerActions = screen.getByTestId('mounted-header-actions');
    expect(
      within(headerActions).getByRole('tablist', { name: 'Registry Filter' })
    ).toBeVisible();
    expect(
      within(screen.getByTestId('feature-review-registry')).queryByRole(
        'tablist',
        { name: 'Registry Filter' }
      )
    ).not.toBeInTheDocument();

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
    const open = within(rail).getByRole('button', {
      name: 'Open Ready feature evidence',
    });
    expect(open).toBeVisible();
    // jsdom lacks the native dialog API the viewer opens with.
    const showModal = HTMLDialogElement.prototype.showModal;
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    fireEvent.click(open);
    HTMLDialogElement.prototype.showModal = showModal;
    expect(screen.getByTestId('media-canvas-viewer')).toHaveAccessibleName(
      'Ready feature evidence (1 of 1)'
    );
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
    const stale = {
      'feature.ready': {
        outcome: 'certified',
        note: 'Old review',
        reviewedAt: '2026-08-30T12:00:00.000Z',
        evidenceDigest: 'sha256:stale',
      },
    };
    localStorage.setItem(
      'ovie-founder-review-decisions-v1',
      JSON.stringify(stale)
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
