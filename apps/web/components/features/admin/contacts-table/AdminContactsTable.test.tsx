import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const { mockRefresh, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the filtered empty state and canonical stage links', () => {
    renderTable({ rows: [], total: 0, search: 'missing' });

    expect(screen.getByText('No contacts matching “missing”.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Paying (1)' })).toHaveAttribute(
      'href',
      '?view=contacts&q=missing&stage=paying'
    );
    expect(screen.getByText('Showing 0–0 of 0')).toBeVisible();
  });

  it('opens lifecycle history and applies a manual stage transition', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          timeline: [
            {
              id: 'transition_1',
              fromStage: 'approved',
              toStage: 'paying',
              actorType: 'system',
              source: 'billing',
              reason: null,
              createdAt: '2026-03-02T00:00:00.000Z',
            },
          ],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    renderTable();
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
      .mockResolvedValueOnce(jsonResponse({ timeline: [] }))
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
});
