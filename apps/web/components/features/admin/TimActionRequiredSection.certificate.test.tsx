import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  TimActionIssue,
  TimActionsResponse,
} from '@/lib/hud/linear-actions';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { TimActionRequiredSection } from './TimActionRequiredSection';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('@/components/feedback', async importOriginal => ({
  ...(await importOriginal<typeof import('@/components/feedback')>()),
  toast,
}));

vi.mock('@/lib/queries/useOvieCertificationsQuery', () => ({
  useOvieCertificationsQuery: () => ({
    data: {
      contract: 'jovie.ovie-certification-inventory/v1',
      generatedAt: '2026-09-27T00:00:00.000Z',
      universal: false,
      domains: [
        {
          domain: 'flows',
          label: 'Flows',
          status: 'connected',
          rowCount: 0,
          note: null,
        },
      ],
      counts: {
        working: 0,
        review_ready: 0,
        founder_locked: 0,
        shipped: 0,
        monitored: 0,
        total: 0,
      },
      queue: {
        contract: 'jovie.certification-inbox/v1',
        needsYou: [],
        blocked: [],
        stale: [],
        returned: [],
        certified: [],
        superseded: [],
      },
      rows: [],
      issues: [],
    },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useOvieCertificationDecisionMutation: () => ({ mutateAsync: vi.fn() }),
  getCertificationDecisionErrorMessage: () =>
    'The decision could not be recorded. Try again.',
}));

const issue = (index: number, title: string): TimActionIssue => ({
  id: `issue-${index}`,
  identifier: `JOV-${6100 + index}`,
  title,
  url: `https://linear.app/jovie/issue/JOV-${6100 + index}`,
  priority: 1,
  priorityLabel: 'Urgent',
  createdAt: '2026-09-19T00:00:00.000Z',
  daysOld: 9,
  stateType: 'started',
});

const listed = (
  overrides: Partial<TimActionsResponse> = {}
): TimActionsResponse => ({
  issues: [issue(1, 'Approve payout batch'), issue(2, 'Review onboarding')],
  fetchedAt: new Date().toISOString(),
  available: true,
  observation: 'ok',
  errorMessage: null,
  ...overrides,
});

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('TimActionRequiredSection certificate', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));
    fetchMock.mockReset();
    toast.success.mockReset();
    toast.error.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('marks a decision done in Linear and refreshes the list', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((_url, init) =>
      init?.method === 'POST'
        ? json({ ok: true })
        : json(listed({ issues: [issue(2, 'Review onboarding')] }))
    );
    fetchMock.mockImplementationOnce(() => json(listed()));
    const { container } = render(<TimActionRequiredSection />);

    const done = await screen.findByRole('button', {
      name: 'Mark "Approve payout batch" as done',
    });
    await expectNoA11yViolations(container);
    await user.click(done);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/hud/tim-actions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ issueId: 'issue-1' }),
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Marked as done in Linear')
    );
    expect(screen.queryByText('Approve payout batch')).toBeNull();
    expect(screen.getByText('Review onboarding')).toBeInTheDocument();
  });

  it('restores the row and reports the server reason when closing fails', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((_url, init) =>
      init?.method === 'POST'
        ? json({ error: 'Linear rejected the update' }, 500)
        : json(listed())
    );
    render(<TimActionRequiredSection />);

    await user.click(
      await screen.findByRole('button', {
        name: 'Mark "Approve payout batch" as done',
      })
    );

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Linear rejected the update')
    );
    expect(screen.getByText('Approve payout batch')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'Mark "Approve payout batch" as done',
      })
    ).toBeEnabled();
  });

  it('retries after an offline read and keeps the failure axe-clean', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new TypeError('Failed to fetch'))
    );
    fetchMock.mockImplementation(() => json(listed()));
    const { container } = render(<TimActionRequiredSection />);

    expect(
      await screen.findByText('Linear actions are unavailable.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Approve payout batch')).toBeInTheDocument();
  });

  it('explains a 403 as an admin lock rather than a Linear outage', async () => {
    fetchMock.mockImplementation(() => json({ error: 'locked' }, 403));
    const { container } = render(<TimActionRequiredSection />);

    expect(
      await screen.findByText(
        'Admin data is locked. Unlock with Touch ID, then retry.'
      )
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps last known decisions with a notice when Linear is degraded', async () => {
    fetchMock.mockImplementation(() =>
      json(listed({ observation: 'unavailable', available: false }))
    );
    const { container } = render(<TimActionRequiredSection />);

    expect(
      await screen.findByText('Showing last known decisions. Retry to refresh.')
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    await expectNoA11yViolations(container);
  });

  it('keeps long and RTL rows axe-clean on the standalone page', async () => {
    const long =
      'Approve the revised payout, distribution and royalty split for every September creator';
    fetchMock.mockImplementation(() =>
      json(listed({ issues: [issue(1, long), issue(2, 'مراجعة الدفعة')] }))
    );
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <TimActionRequiredSection presentation='page' />
      </div>
    );

    expect(await screen.findByText(long)).toBeInTheDocument();
    expect(screen.getByText('2 decisions')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
