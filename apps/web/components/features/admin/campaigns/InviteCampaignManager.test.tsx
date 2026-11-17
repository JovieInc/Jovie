import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { InviteCampaignManager } from './InviteCampaignManager';
import {
  activeQueueStats,
  buildInvite,
  buildPreview,
  type CampaignRoutes,
  inviteList,
  json,
  never,
  offline,
  routeCampaignRequest,
} from './inviteCampaign.test-fixtures';

const fetchMock = vi.fn<typeof fetch>();

function useRoutes(routes: CampaignRoutes = {}) {
  fetchMock.mockImplementation((input, init) => {
    const url = new URL(String(input), 'http://localhost');
    return (
      routeCampaignRequest(routes, url, init) ??
      Promise.resolve(Response.json({ error: 'unmocked' }, { status: 404 }))
    );
  });
}

function callsTo(pathname: string, method = 'GET') {
  return fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(String(input), 'http://localhost');
    return url.pathname === pathname && (init?.method ?? 'GET') === method;
  });
}

function renderManager(embedded = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <InviteCampaignManager embedded={embedded} />
    </QueryClientProvider>
  );
}

const SEND_PATH = '/api/admin/creator-invite/bulk';

describe('InviteCampaignManager', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders stats, funnel, activity and the preview from saved settings', async () => {
    useRoutes();
    const { container } = renderManager();
    expect(await screen.findByText('Send 2 Invites')).toBeInTheDocument();
    expect(await screen.findByText('Total Invites')).toBeInTheDocument();
    expect(await screen.findByText('@papercomets')).toBeInTheDocument();
    expect(screen.getByText('Clicked (3)')).toBeInTheDocument();
    expect(screen.getByText('Opened')).toBeInTheDocument();
    expect(screen.getByText('No events')).toBeInTheDocument();
    expect(screen.getByText('11.0%')).toBeInTheDocument();
    expect(
      await screen.findByText(/fit score >= 60, batch size 10/)
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Change in Ops' })).toHaveAttribute(
      'href'
    );
    const preview = callsTo(SEND_PATH).map(([input]) => String(input));
    expect(preview.at(-1)).toBe(
      '/api/admin/creator-invite/bulk?threshold=60&limit=10'
    );
    expect(screen.queryByText('Job Queue Active')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('refetches the preview when Refresh is pressed', async () => {
    const user = userEvent.setup();
    useRoutes();
    renderManager();
    await screen.findByText('Send 2 Invites');
    const before = callsTo(SEND_PATH).length;
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() =>
      expect(callsTo(SEND_PATH).length).toBeGreaterThan(before)
    );
  });

  it('queues a small batch straight away with the saved throttling', async () => {
    const user = userEvent.setup();
    useRoutes();
    const { container } = renderManager();
    await user.click(
      await screen.findByRole('button', { name: 'Send 2 Invites' })
    );
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Successfully queued 2 invites!');
    expect(status).toHaveTextContent('Estimated completion: ~2 minutes');
    const [, init] = callsTo(SEND_PATH, 'POST')[0];
    expect(JSON.parse(String(init?.body))).toEqual({
      fitScoreThreshold: 60,
      limit: 10,
      minDelayMs: 30_000,
      maxDelayMs: 90_000,
      maxPerHour: 30,
      dryRun: false,
    });
    await expectNoA11yViolations(container);
  });

  it('asks for confirmation before a large batch and can be cancelled', async () => {
    const user = userEvent.setup();
    useRoutes({ preview: json(buildPreview(30, 4)) });
    renderManager();
    await user.click(
      await screen.findByRole('button', { name: 'Send 30 Invites' })
    );
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Confirm Large Batch Send',
    });
    expect(dialog).toHaveTextContent('You are about to send 30 invite emails');
    await expectNoA11yViolations(dialog);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    );
    expect(callsTo(SEND_PATH, 'POST')).toHaveLength(0);
  });

  it('sends a large batch once confirmed', async () => {
    const user = userEvent.setup();
    useRoutes({
      preview: json(buildPreview(30)),
      send: json({ ok: true, jobsEnqueued: 30, estimatedMinutes: 30 }),
    });
    renderManager();
    await user.click(
      await screen.findByRole('button', { name: 'Send 30 Invites' })
    );
    await user.click(
      await screen.findByRole('button', { name: 'Confirm Send' })
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Successfully queued 30 invites!'
    );
    expect(callsTo(SEND_PATH, 'POST')).toHaveLength(1);
  });

  it('shows the send failure in the preview section', async () => {
    const user = userEvent.setup();
    useRoutes({
      send: json({ error: 'Invite sender is paused' }, 409),
    });
    const { container } = renderManager();
    await user.click(
      await screen.findByRole('button', { name: 'Send 2 Invites' })
    );
    expect(await screen.findByText('Invite sender is paused')).toBeVisible();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows loading spinners and disables actions while reads are pending', async () => {
    useRoutes({
      settings: never,
      preview: never,
      stats: never,
      overview: never,
      invites: never,
    });
    const { container } = renderManager();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Send 0 Invites' })
    ).toBeDisabled();
    expect(screen.queryByText('Total Invites')).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows empty activity and blocks sending when nobody has an email', async () => {
    useRoutes({
      preview: json(buildPreview(0, 5, [])),
      invites: json(inviteList([])),
    });
    const { container } = renderManager();
    expect(await screen.findByText('No invite activity')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Send 0 Invites' })
      ).toBeDisabled()
    );
    expect(screen.getByText('Needs enrichment first')).toBeInTheDocument();
    expect(
      screen.queryByText('Sample profiles to invite:')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the preview error and keeps sending disabled', async () => {
    useRoutes({ preview: json({ error: 'boom' }, 500) });
    const { container } = renderManager();
    expect(
      await screen.findByText(
        'Request failed due to a temporary server issue. Please try again.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send 0 Invites' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('surfaces a permission refusal from the preview read', async () => {
    useRoutes({ preview: json({ error: 'Admin access required' }, 403) });
    const { container } = renderManager();
    expect(
      await screen.findByText('Admin access required')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Send 0 Invites' })
    ).toBeDisabled();
    await expectNoA11yViolations(container);
  });

  it('shows an error when the network is offline', async () => {
    useRoutes({
      settings: offline,
      preview: offline,
      stats: offline,
      overview: offline,
      invites: offline,
    });
    const { container } = renderManager();
    expect(
      await screen.findByText('Network request failed')
    ).toBeInTheDocument();
    expect(screen.getByText('No invite activity')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows the active job queue with its remaining estimate', async () => {
    useRoutes({ stats: json(activeQueueStats) });
    const { container } = renderManager(true);
    expect(await screen.findByText('Job Queue Active')).toBeInTheDocument();
    expect(screen.getByText('~9 min')).toBeInTheDocument();
    expect(screen.getByText(/Next job scheduled:/)).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('keeps long creator handles and emails inside the tables', async () => {
    const handle = 'the-extraordinarily-long-collective-handle-for-overflow';
    useRoutes({
      invites: json(inviteList([buildInvite('long', handle)])),
      preview: json(
        buildPreview(1, 0, [
          {
            id: 'long',
            username: handle,
            displayName: null,
            fitScore: 91,
            email: `${handle}@an-unusually-long-label-domain.example.com`,
          },
        ])
      ),
    });
    const { container } = renderManager();
    await waitFor(() =>
      expect(screen.getAllByText(`@${handle}`)).toHaveLength(2)
    );
    expect(
      screen.getByText(`${handle}@an-unusually-long-label-domain.example.com`)
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
