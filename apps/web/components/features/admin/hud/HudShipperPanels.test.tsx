import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type {
  HudGithubRateLimitsPayload,
  HudShipperStatusPayload,
} from '@/types/hud-shipper';
import { HudGithubBudgetPanel, HudShipperNeedPanel } from './HudShipperPanels';

const shipper: HudShipperStatusPayload = {
  availability: 'available',
  state: 'running',
  isPaused: false,
  launchdLoaded: true,
  lastRunAt: '2026-09-01T12:00:00.000Z',
  lastResult: 'dispatched 2',
  dispatchableCount: 4,
  inFlightCount: 1,
  inFlightJobs: [
    {
      job: 'ship-1',
      repo: 'jovie',
      issue: 42,
      branch: 'claude/example',
      worktree: 'worktrees/ship-1',
      pid: 1234,
      startedAt: '2026-09-01T12:00:00.000Z',
    },
  ],
  currentAgents: [],
  lastError: 'Last run failed',
  recentErrors: ['line one', 'line two'],
  capacity: null,
  generatedAtIso: '2026-09-01T12:01:00.000Z',
};

const rateLimits: HudGithubRateLimitsPayload = {
  availability: 'available',
  core: {
    limit: 5000,
    remaining: 4200,
    resetAtIso: '2026-09-01T13:00:00.000Z',
  },
  graphql: {
    limit: 5000,
    remaining: 100,
    resetAtIso: '2026-09-01T13:00:00.000Z',
  },
  generatedAtIso: '2026-09-01T12:01:00.000Z',
};

function renderWithQuery(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

function stubFetch(...responses: Array<Response | Error>) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
    else fetchMock.mockResolvedValueOnce(response);
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HudShipperNeedPanel', () => {
  it('shows the signed-in shipper status, ledger and errors', async () => {
    stubFetch(json(shipper));
    const { container } = renderWithQuery(
      <HudShipperNeedPanel source='admin-session' />
    );

    expect(await screen.findByText('Running')).toBeInTheDocument();
    expect(screen.getByText('dispatched 2')).toBeInTheDocument();
    expect(screen.getByText('#42')).toBeInTheDocument();
    expect(screen.getByText('Last run failed')).toBeInTheDocument();
    expect(screen.getByText(/line one/)).toBeInTheDocument();

    const panel = screen.getByTestId('hud-shipper-status-panel');
    expect(panel.querySelector('pre')?.className).not.toContain('border');
    await expectNoA11yViolations(container);
  });

  it('keeps the kiosk view signal-free and does not fetch', async () => {
    const fetchMock = stubFetch();
    const { container } = renderWithQuery(
      <HudShipperNeedPanel source='kiosk-token' />
    );

    expect(screen.getByText('No Signal')).toBeInTheDocument();
    expect(
      screen.getByText('Shipper status stays on the signed-in operator path.')
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('shows a retryable unavailable state and recovers on retry', async () => {
    const user = userEvent.setup();
    stubFetch(json({}, 500), json(shipper));
    const { container } = renderWithQuery(
      <HudShipperNeedPanel source='admin-session' />
    );

    expect(
      await screen.findByText('Shipper status is unavailable.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByText('Running')).toBeInTheDocument();
  });

  it('shows a loading label while the request is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {}))
    );
    const { container } = renderWithQuery(
      <HudShipperNeedPanel source='admin-session' />
    );

    expect(screen.getByText('Loading HUD panel')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});

describe('HudGithubBudgetPanel', () => {
  it('shows remaining REST and GraphQL budget', async () => {
    stubFetch(json(rateLimits));
    const { container } = renderWithQuery(<HudGithubBudgetPanel />);

    expect(await screen.findByText('4,200')).toBeInTheDocument();
    expect(screen.getByText('4,200 / 5,000 remaining')).toBeInTheDocument();
    expect(screen.getByText('100 / 5,000 remaining')).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('asks to configure credentials when none are set', async () => {
    stubFetch(
      json({
        availability: 'not_configured',
        core: null,
        graphql: null,
        generatedAtIso: '2026-09-01T12:01:00.000Z',
      })
    );
    renderWithQuery(<HudGithubBudgetPanel />);

    expect(
      await screen.findByText(
        'Configure HUD GitHub credentials to load rate limits.'
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText('No data')).toHaveLength(2);
  });

  it('shows an unavailable state when the request fails offline', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    renderWithQuery(<HudGithubBudgetPanel />);

    await waitFor(() =>
      expect(
        screen.getByText('GitHub rate limits are unavailable.')
      ).toBeInTheDocument()
    );
  });
});
