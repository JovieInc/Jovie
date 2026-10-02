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
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { FounderReviewItem } from '@/lib/admin/founder-review-registry';
import type {
  OvieCertificationInventory,
  OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import { founderReviewItemFixture } from '@/tests/fixtures/founder-review-item';

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutateAsync: vi.fn(),
}));

vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: mocks.query,
  useOvieCertificationDecisionMutation: () => ({
    mutateAsync: mocks.mutateAsync,
  }),
  getCertificationDecisionErrorMessage: () => 'The evidence changed.',
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

/** Server-side certification row projection for one registry item. */
function registryRow(
  item: FounderReviewItem,
  overrides: Partial<OvieCertificationRow['decision']> = {}
): OvieCertificationRow {
  const reviewReady = item.readiness === 'ready' && !('available' in overrides);
  return {
    id: `feature_registry:${item.id}`,
    domain: 'feature_registry',
    surface: 'Feature Capability',
    subject: { id: item.id, kind: 'feature', title: item.title },
    state: reviewReady ? 'review_ready' : 'working',
    tiers: {},
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
  } as OvieCertificationRow;
}

function mockInventory(rows: readonly OvieCertificationRow[]) {
  mocks.query.mockReturnValue({
    data: {
      rows,
      generatedAt: '2026-10-02T00:00:00.000Z',
    } as unknown as OvieCertificationInventory,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  });
}

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
    vi.clearAllMocks();
    mockInventory(items.map(item => registryRow(item)));
  });

  it('uses the unified selectable table and mounts media-first certification details in the right rail', async () => {
    mockInventory(items.map(item => registryRow(item)));
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

  it('records decisions through the certification decisions API bound to the server digest', async () => {
    const user = userEvent.setup();
    const readyItem = items.find(item => item.id === 'feature.ready');
    expect(readyItem).toBeDefined();
    if (!readyItem) return;
    mocks.mutateAsync.mockResolvedValue({ row: registryRow(readyItem) });
    mockInventory(items.map(item => registryRow(item)));
    renderRegistry();

    const rail = await screen.findByTestId('founder-review-detail-rail');
    await user.click(within(rail).getByTestId('certify-review-item'));

    await waitFor(() => {
      expect(mocks.mutateAsync).toHaveBeenCalledWith({
        rowId: 'feature_registry:feature.ready',
        evidenceDigest: readyItem.decisionEvidenceDigest,
        decision: 'approved',
        notes: null,
        actionId: expect.any(String),
      });
    });
    // A recorded decision leaves no authoritative local mark behind.
    await waitFor(() => {
      expect(
        JSON.parse(
          localStorage.getItem('ovie-founder-review-decisions-v1') ?? '{}'
        )
      ).not.toHaveProperty('feature.ready');
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

  it('keeps the draft and surfaces the server error when the decision write fails', async () => {
    const user = userEvent.setup();
    const readyItem = items.find(item => item.id === 'feature.ready');
    if (!readyItem) return;
    mocks.mutateAsync.mockRejectedValue(new Error('conflict'));
    mockInventory(items.map(item => registryRow(item)));
    renderRegistry();

    const rail = await screen.findByTestId('founder-review-detail-rail');
    await user.click(within(rail).getByTestId('certify-review-item'));

    expect(
      await within(rail).findByText('The evidence changed.')
    ).toBeVisible();
    // The unconfirmed write stays a clearly-labeled draft, never an approval.
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
    expect(
      within(screen.getByTestId('founder-review-row-feature.ready')).getByText(
        'Draft · Certified'
      )
    ).toBeVisible();
  });

  it('requires a founder note before Needs Work can be sent', async () => {
    const user = userEvent.setup();
    mockInventory(items.map(item => registryRow(item)));
    renderRegistry();

    const rail = await screen.findByTestId('founder-review-detail-rail');
    const needsWork = within(rail).getByRole('button', { name: 'Needs Work' });
    expect(needsWork).toBeDisabled();

    await user.type(
      within(rail).getByPlaceholderText('What should stay true or change?'),
      'Hero crop is off on mobile'
    );
    expect(needsWork).toBeEnabled();
    await user.click(needsWork);
    expect(mocks.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: 'changes_requested',
        notes: 'Hero crop is off on mobile',
      })
    );
  });

  it('shows certified only from the authoritative server row, not local marks', async () => {
    const readyItem = items.find(item => item.id === 'feature.ready');
    if (!readyItem) return;
    // A legacy local mark must not read as an approval.
    localStorage.setItem(
      'ovie-founder-review-decisions-v1',
      JSON.stringify({
        'feature.contacts.delete-contact': {
          outcome: 'certified',
          note: 'Old local mark',
          reviewedAt: '2026-08-30T12:00:00.000Z',
          evidenceDigest: items[1].decisionEvidenceDigest,
        },
      })
    );
    mockInventory(
      items.map(item =>
        registryRow(item, {
          available: false,
          reason: 'A founder decision already exists for this evidence.',
          currentDecision:
            item.id === 'feature.ready'
              ? {
                  kind: 'approved',
                  decidedAt: '2026-10-02T00:00:00.000Z',
                  reviewer: 'founder@jovie.test',
                  notes: null,
                }
              : null,
        })
      )
    );
    renderRegistry();

    const readyRow = await screen.findByTestId(
      'founder-review-row-feature.ready'
    );
    expect(within(readyRow).getByText('Certified')).toBeVisible();
    const localOnlyRow = screen.getByTestId(
      'founder-review-row-feature.contacts.delete-contact'
    );
    await waitFor(() => {
      expect(within(localOnlyRow).getByText('Draft · Certified')).toBeVisible();
      expect(within(localOnlyRow).queryByText('Certified')).toBeNull();
    });
  });

  it('removes a local draft recorded against a stale evidence digest', async () => {
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
    mockInventory(items.map(item => registryRow(item)));

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
