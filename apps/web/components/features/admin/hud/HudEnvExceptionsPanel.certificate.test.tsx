import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type {
  HudEnvActiveException,
  HudEnvExceptionsPayload,
} from '@/types/hud-env-exceptions';
import { HudEnvExceptionsPanel } from './HudEnvExceptionsPanel';

const entry: HudEnvActiveException = {
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
  cleanupState: 'cleanup-pending',
  costBudget: '$0.50',
  blocker: false,
  blockerReason: null,
};

function payload(
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

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <HudEnvExceptionsPanel />
    </QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HudEnvExceptionsPanel certificate', () => {
  it('holds an axe-clean skeleton while the request is pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValue(new Promise<never>(() => {}))
    );
    const { container } = renderPanel();

    expect(screen.getByText('Loading HUD panel')).toBeInTheDocument();
    expect(
      screen.queryByTestId('hud-env-exceptions-panel')
    ).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('renders loaded rows, an expired blocker and the lanes disclosure, axe-clean', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          payload({
            activeExceptions: [
              entry,
              {
                ...entry,
                id: 'pr-16908',
                workId: null,
                sha: null,
                owner: null,
                environment: null,
                reason: null,
                requiredEvidence: null,
                costBudget: null,
                ageMs: 30_000,
                expiresInMs: -90 * 60_000,
                expired: true,
                cleanupState: 'orphaned',
                blocker: true,
                blockerReason: 'Expired without a cleanup receipt',
              },
            ],
            lanes: [
              {
                id: 'ci-neon-db',
                kind: 'neon-branch',
                policy: 'ephemeral-2h',
                owner: 'owl',
                surface: 'ci',
                evidencePurpose: 'migration proof',
                ttlHours: null,
                cleanupTrigger: 'pr-close',
                costBudget: '$0.00',
              },
            ],
          })
        )
      )
    );
    const { container } = renderPanel();

    const blockerRow = await screen.findByTestId('hud-env-exception-pr-16908');
    expect(screen.getByText('1 blocker')).toBeInTheDocument();
    expect(blockerRow).toHaveTextContent('pr-16908');
    expect(blockerRow).toHaveTextContent('vercel-preview · —');
    expect(blockerRow).toHaveTextContent(
      'unknown owner · age <1m · expired 1h 30m ago'
    );
    expect(blockerRow).toHaveTextContent('Evidence: — · Budget: —');
    expect(blockerRow).toHaveTextContent('Blocker: orphaned');
    expect(screen.getByTestId('hud-env-exception-pr-17166')).toHaveTextContent(
      'itstimwhite · age 45m · expires in 2h · jovie-git-pr-17166'
    );
    await expectNoA11yViolations(container);

    const summary = screen.getByText('Admitted standing lanes (1)');
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(
      screen.getByText(/neon-branch · ephemeral-2h · TTL —/)
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('renders the empty payload axe-clean', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(payload()))
    );
    const { container } = renderPanel();

    expect(
      await screen.findByText('No active hosted environment exceptions.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/blocker/)).not.toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('shows Unavailable on a 500 and recovers when Retry succeeds, axe-clean', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('error', { status: 500 }))
      .mockResolvedValue(Response.json(payload()));
    vi.stubGlobal('fetch', fetchMock);
    const { container } = renderPanel();

    const retry = await screen.findByTestId(
      'hud-env-exceptions-observation-retry'
    );
    expect(
      screen.getByText('Hosted environment exceptions are unavailable.')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);

    await user.click(retry);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText('No active hosted environment exceptions.')
    ).toBeInTheDocument();
  });
});
