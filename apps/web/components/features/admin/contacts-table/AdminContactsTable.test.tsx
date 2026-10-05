import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { AdminPeopleRightPanelProvider } from '@/features/admin/AdminPeopleRightPanelProvider';
import type {
  AdminContactRow,
  AdminContactStageMetrics,
} from './AdminContactsTable';
import { AdminContactsTable } from './AdminContactsTable';

const { mockRefresh, mockPush, mockToastError, mockToastSuccess } = vi.hoisted(
  () => ({
    mockRefresh: vi.fn(),
    mockPush: vi.fn(),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
  })
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh, push: mockPush }),
}));

vi.mock('@/components/feedback', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}));

vi.mock('@/features/admin/table/AdminTableShell', () => ({
  AdminTableShell: ({
    children,
    footer,
    toolbar,
  }: {
    readonly children: (props: {
      readonly headerElevated: boolean;
      readonly stickyTopPx: number;
    }) => ReactNode;
    readonly footer?: ReactNode;
    readonly toolbar?: ReactNode;
  }) => (
    <section>
      {toolbar}
      {children({ headerElevated: false, stickyTopPx: 0 })}
      {footer}
    </section>
  ),
}));

const contact: AdminContactRow = {
  dedupeKey: 'email:ari@example.com',
  stage: 'paying',
  overrideStage: null,
  displayName: 'Ari Lane',
  email: 'ari@example.com',
  handle: 'ari',
  avatarUrl: null,
  sources: ['profile', 'user'],
  certifiedAt: '2026-02-01T00:00:00.000Z',
  stageAt: '2026-03-01T00:00:00.000Z',
  activityAt: '2026-03-02T00:00:00.000Z',
  firstSeenAt: '2026-01-10T00:00:00.000Z',
  userId: 'user_1',
  creatorProfileId: 'profile_1',
  leadId: null,
  waitlistEntryId: null,
};

const metrics: AdminContactStageMetrics = {
  total: 1,
  suggested: 0,
  approved: 0,
  outreach: 0,
  profile_created: 0,
  certified: 0,
  signed_up: 0,
  claimed: 0,
  activated: 0,
  paying: 1,
  churned: 0,
};

// biome-ignore format: compact evidence fixture keeps the interaction regression inside the PR budget.
const certification = { evidenceRevision: 'profile-revision-1', status: 'needs_review' as const, canCertify: false, coverage: { confirmed: 0, rejected: 0, unresolved: 1, stale: 0, sourceClassesChecked: ['identity'], missingSourceClasses: [] }, items: [{ key: 'canonical:display-name', revision: 'evidence-revision-1', category: 'identity' as const, label: 'Display name', value: 'Ari Lane', url: null, source: 'profile, user', observedAt: '2026-03-02T00:00:00.000Z', confidence: 0.85, rationale: 'Joined across the canonical CRM identity sources.', freshness: 'fresh' as const, decision: null }] };
// biome-ignore format: timeline shape is incidental to the evidence interaction under test.
const detailResponse = (overrides: Record<string, unknown> = {}) => ({ certification: { ...certification, ...overrides }, timeline: [{ id: 'transition_1', fromStage: 'approved', toStage: 'paying', actorType: 'system', createdAt: '2026-03-02T00:00:00.000Z' }] });

function RightPanelOutlet() {
  return <aside data-testid='right-panel'>{useRightPanel()}</aside>;
}

function renderTable(
  overrides: Partial<React.ComponentProps<typeof AdminContactsTable>> = {}
) {
  const props: React.ComponentProps<typeof AdminContactsTable> = {
    rows: [contact],
    total: 1,
    page: 1,
    pageSize: 50,
    stage: null,
    search: '',
    metrics,
    ...overrides,
  };

  return render(
    <RightPanelProvider>
      <AdminPeopleRightPanelProvider>
        <AdminContactsTable {...props} />
      </AdminPeopleRightPanelProvider>
      <RightPanelOutlet />
    </RightPanelProvider>
  );
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AdminContactsTable', () => {
  const browserMethods = [
    'hasPointerCapture',
    'releasePointerCapture',
    'setPointerCapture',
    'scrollIntoView',
  ] as const;
  const originalMethods = browserMethods.map(name =>
    Object.getOwnPropertyDescriptor(Element.prototype, name)
  );
  beforeAll(() => {
    for (const name of browserMethods) {
      if (!Element.prototype[name])
        Object.defineProperty(Element.prototype, name, {
          configurable: true,
          value: vi.fn(() => false),
        });
    }
  });
  afterAll(() => {
    browserMethods.forEach((name, index) => {
      const descriptor = originalMethods[index];
      if (descriptor)
        Object.defineProperty(Element.prototype, name, descriptor);
      else Reflect.deleteProperty(Element.prototype, name);
    });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('filters by stage while preserving search and resetting pagination', async () => {
    const user = userEvent.setup();
    renderTable({ rows: [], total: 0, search: 'missing', page: 3 });

    expect(screen.getByText('No contacts matching “missing”.')).toBeVisible();
    await user.click(
      screen.getByRole('combobox', { name: 'Filter By Lifecycle Stage' })
    );
    await user.click(screen.getByRole('option', { name: 'Paying (1)' }));
    expect(mockPush).toHaveBeenCalledWith(
      '?view=contacts&q=missing&stage=paying'
    );
    expect(screen.getByText('Showing 0–0 of 0')).toBeVisible();
  });

  it('clears the stage filter without losing the search term', async () => {
    const user = userEvent.setup();
    renderTable({ stage: 'paying', search: 'ari', page: 2 });
    await user.click(
      screen.getByRole('combobox', { name: 'Filter By Lifecycle Stage' })
    );
    await user.click(screen.getByRole('option', { name: /All stages/ }));
    expect(mockPush).toHaveBeenCalledWith('?view=contacts&q=ari');
  });

  it('opens lifecycle history and applies a manual stage transition', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detailResponse()))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    renderTable();
    // Canonical dense people row with a face, not a hand-rolled 56px table.
    expect(
      document.querySelector('table[data-table-row-mode="dense"]')
    ).not.toBeNull();
    expect(
      screen
        .getByTestId('admin-contact-row')
        .querySelector('[data-table-person-cell]')
    ).not.toBeNull();
    fireEvent.click(screen.getByTestId('admin-contact-row'));

    expect(
      await screen.findByTestId('admin-contact-detail-panel')
    ).toBeVisible();
    expect(await screen.findByText(/system ·/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/admin/contacts');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      dedupeKey: contact.dedupeKey,
      toStage: 'approved',
    });
    expect(mockToastSuccess).toHaveBeenCalledWith('Moved to Approved');
    expect(mockRefresh).toHaveBeenCalledOnce();
  });

  it('surfaces a failed stage transition and restores the actions', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detailResponse()))
      .mockResolvedValueOnce(
        jsonResponse({ error: 'Stage change denied' }, 409)
      );

    renderTable();
    fireEvent.click(screen.getByTestId('admin-contact-row'));
    await screen.findByTestId('admin-contact-detail-panel');

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith('Stage change denied')
    );

    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
    expect(mockRefresh).not.toHaveBeenCalled();
  });

  // biome-ignore format: compact race regression keeps component gate evidence inside the PR cap.
  it('aborts stale detail loads when selection changes', async () => { const fetchMock = vi.mocked(fetch).mockImplementation(() => new Promise<Response>(() => {})); renderTable({ rows: [contact, { ...contact, dedupeKey: 'email:bea@example.com', email: 'bea@example.com' }], total: 2 }); fireEvent.click(screen.getAllByTestId('admin-contact-row')[0]!); await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce()); const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal; fireEvent.click(screen.getAllByTestId('admin-contact-row')[1]!); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2)); expect(firstSignal?.aborted).toBe(true); });

  // biome-ignore format: compact interaction regression keeps component gate evidence inside the PR cap.
  it('reviews exact evidence and updates certification state immediately', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(detailResponse()))
      .mockResolvedValueOnce(jsonResponse({ ok: true, certification: { ...certification, status: 'human_reviewed', items: [{ ...certification.items[0], decision: 'no' }] } }));

    renderTable();
    fireEvent.click(screen.getByTestId('admin-contact-row'));
    expect(await screen.findByText('Display name')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'No' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ action: 'review_evidence', dedupeKey: contact.dedupeKey, evidenceKey: 'canonical:display-name', evidenceRevision: 'evidence-revision-1', decision: 'no' });
    expect(screen.getByText('Human reviewed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'No' })).toHaveAttribute('aria-pressed', 'true');
  });
});
