import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  HudEnvActiveException,
  HudEnvExceptionLane,
  HudEnvExceptionsPayload,
} from '@/types/hud-env-exceptions';
import { HudEnvExceptionsPanel } from './HudEnvExceptionsPanel';

function buildEntry(
  overrides: Partial<HudEnvActiveException> = {}
): HudEnvActiveException {
  return {
    id: 'pr-17166',
    kind: 'vercel-preview',
    workId: 'JOV-5941',
    sha: 'b4f93e3a9d6e201825aedc09d8d0dfc055e7d082',
    owner: 'itstimwhite',
    reason: 'Manual preview for a supervisor walkthrough',
    requiredEvidence: 'manual-dispatch',
    environment: 'jovie-git-pr-17166',
    createdAt: '2026-09-04T01:10:00.000Z',
    expiresAt: '2026-09-05T01:10:00.000Z',
    ageMs: 45 * 60_000,
    expiresInMs: 2 * 3_600_000,
    expired: false,
    countsAsEvidence: false,
    cleanupState: 'admitted',
    costBudget: '$0.50',
    blocker: false,
    blockerReason: null,
    ...overrides,
  };
}

function buildLane(
  overrides: Partial<HudEnvExceptionLane> = {}
): HudEnvExceptionLane {
  return {
    id: 'ci-neon-db',
    kind: 'neon-branch',
    policy: 'ephemeral-2h',
    owner: 'owl',
    surface: 'ci',
    evidencePurpose: 'migration proof',
    ttlHours: 2,
    cleanupTrigger: 'pr-close',
    costBudget: '$0.00',
    ...overrides,
  };
}

function buildPayload(
  overrides: Partial<HudEnvExceptionsPayload> = {}
): HudEnvExceptionsPayload {
  return {
    schema: 'jovie-hud-env-exceptions/v1',
    generatedAt: '2026-09-04T02:00:00.000Z',
    updatedBy: 'neon-scheduled-cleanup',
    lanes: [],
    activeExceptions: [],
    ...overrides,
  };
}

function renderPanel(payload?: HudEnvExceptionsPayload) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  if (payload) {
    queryClient.setQueryData(['hud', 'env-exceptions'], payload);
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <HudEnvExceptionsPanel />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HudEnvExceptionsPanel', () => {
  it('renders active exceptions with blocker summary and standing lanes', () => {
    // FREQUENT_CACHE refetches on mount; keep the background fetch pending so
    // the seeded cache stays the source of truth for this render.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<never>(() => {}))
    );
    renderPanel(
      buildPayload({
        activeExceptions: [
          buildEntry({
            cleanupState: 'orphaned',
            blocker: true,
            blockerReason: 'Expired without a cleanup receipt',
          }),
          buildEntry({
            id: 'pr-17049',
            workId: null,
            sha: null,
            cleanupState: 'cleaned',
          }),
        ],
        lanes: [buildLane()],
      })
    );

    expect(screen.getByTestId('hud-env-exceptions-panel')).toBeInTheDocument();
    expect(screen.getByText('Env exceptions')).toBeInTheDocument();
    expect(screen.getByText('1 blocker')).toBeInTheDocument();
    expect(
      screen.getByTestId('hud-env-exception-pr-17166')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('hud-env-exception-pr-17049')
    ).toBeInTheDocument();
    expect(screen.getByText('Blocker: orphaned')).toBeInTheDocument();
    expect(
      screen.getByText(/Expired without a cleanup receipt/)
    ).toBeInTheDocument();
    expect(screen.getAllByText(/age 45m · expires in 2h/)).toHaveLength(2);
    expect(screen.getByText(/JOV-5941/)).toBeInTheDocument();
    expect(screen.getByText(/b4f93e3/)).toBeInTheDocument();
    expect(screen.getByText('Admitted standing lanes (1)')).toBeInTheDocument();
  });

  it('renders the empty state without standing lanes', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<never>(() => {}))
    );
    renderPanel(buildPayload());

    expect(
      screen.getByText('No active hosted environment exceptions.')
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Admitted standing lanes/)
    ).not.toBeInTheDocument();
  });

  it('surfaces the unavailable state with a working retry', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new Error('preview env API unavailable'));
    vi.stubGlobal('fetch', fetchMock);

    renderPanel();

    const retry = await screen.findByTestId(
      'hud-env-exceptions-observation-retry'
    );
    expect(
      screen.getByTestId('hud-env-exceptions-observation')
    ).toHaveAttribute('data-state', 'unavailable');

    fireEvent.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
