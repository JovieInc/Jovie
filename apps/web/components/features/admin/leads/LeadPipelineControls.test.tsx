import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadPipelineSettings } from '@/lib/queries';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { LeadPipelineControls } from './LeadPipelineControls';

const toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() };
const saveSettings = vi.fn();
const runDiscovery = vi.fn();
const runQualification = vi.fn();
let settingsQuery: {
  data?: { settings: LeadPipelineSettings };
  isLoading: boolean;
  isFetching: boolean;
  error?: Error | null;
};

vi.mock('@/components/feedback', () => ({
  toast: {
    error: (...args: unknown[]) => toast.error(...args),
    success: (...args: unknown[]) => toast.success(...args),
    warning: (...args: unknown[]) => toast.warning(...args),
  },
}));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    admin: {
      leads: {
        all: () => ['admin', 'leads'],
        settings: () => ['admin', 'leads', 'settings'],
      },
    },
  },
  useLeadPipelineSettingsQuery: () => settingsQuery,
  useUpdateLeadPipelineSettingsMutation: () => ({
    mutateAsync: saveSettings,
    isPending: false,
  }),
  useRunLeadDiscoveryMutation: () => ({
    mutateAsync: runDiscovery,
    isPending: false,
  }),
  useRunLeadQualificationMutation: () => ({
    mutateAsync: runQualification,
    isPending: false,
  }),
}));

const SETTINGS: LeadPipelineSettings = {
  enabled: true,
  discoveryEnabled: true,
  autoIngestEnabled: false,
  autoIngestMinFitScore: 60,
  autoIngestDailyLimit: 10,
  dailyQueryBudget: 100,
  dailySendCap: 20,
  maxPerHour: 5,
  rampMode: 'manual',
  guardrailsEnabled: true,
  guardrailThresholds: {
    minimumSampleSize: 50,
    increaseClaimClickRate: 0.2,
    holdClaimClickRateFloor: 0.1,
    pauseClaimClickRateFloor: 0.05,
    maxBounceComplaintRate: 0.02,
    maxUnsubscribeRate: 0.01,
    maxProviderFailureRate: 0.05,
  },
  queriesUsedToday: 12,
  autoIngestedToday: 3,
};

function diagnostic(index: number, overrides: Record<string, unknown> = {}) {
  return {
    keywordId: `keyword-${index}`,
    query: `site:linktr.ee music ${index}`,
    rawResultCount: 10,
    linktreeUrlsFound: 4,
    newLeadsInserted: 2,
    duplicatesSkipped: 2,
    error: null,
    durationMs: 420,
    searchOffset: 11,
    ...overrides,
  };
}

function result(diagnostics: ReturnType<typeof diagnostic>[]) {
  return {
    result: {
      queriesUsed: diagnostics.length,
      candidatesProcessed: 4,
      newLeadsFound: 2,
      duplicatesSkipped: 2,
      diagnostics,
      budgetRemaining: 88,
      keywordRotationIndex: 1,
      totalEnabledKeywords: 24,
    },
  };
}

function wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('LeadPipelineControls', () => {
  beforeEach(() => {
    for (const mock of [
      toast.error,
      toast.success,
      toast.warning,
      saveSettings,
      runDiscovery,
      runQualification,
    ])
      mock.mockReset();
    settingsQuery = {
      data: { settings: SETTINGS },
      isLoading: false,
      isFetching: false,
    };
  });

  it('shows the loading line while settings load', async () => {
    settingsQuery = { isLoading: true, isFetching: true };
    const { container } = render(<LeadPipelineControls />, { wrapper });

    expect(screen.getByText('Loading pipeline settings...')).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('shows the query error, or a fallback, when settings fail to load', async () => {
    settingsQuery = {
      isLoading: false,
      isFetching: false,
      error: new Error('Failed to fetch'),
    };
    const { container, rerender } = render(<LeadPipelineControls />, {
      wrapper,
    });

    expect(screen.getByText('Failed to fetch')).toBeVisible();
    await expectNoA11yViolations(container);

    settingsQuery = { isLoading: false, isFetching: false, error: null };
    rerender(<LeadPipelineControls />);
    expect(
      screen.getByText('Unable to load pipeline settings. Please refresh.')
    ).toBeVisible();
  });

  it('saves edited settings, axe-clean', async () => {
    const user = userEvent.setup();
    saveSettings.mockImplementation(async (settings: LeadPipelineSettings) => ({
      settings,
    }));
    const { container } = render(<LeadPipelineControls />, { wrapper });

    await user.click(
      screen.getByRole('switch', { name: 'Toggle Auto-ingest' })
    );
    await user.click(screen.getByRole('button', { name: 'Manual' }));
    // Typing appends to the current 100.
    await user.type(screen.getByLabelText(/^Daily query budget/), '0');
    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        autoIngestEnabled: true,
        rampMode: 'recommend_only',
        dailyQueryBudget: 1000,
      })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Pipeline settings saved')
    );
    expect(
      screen.getByRole('button', { name: 'Recommend only' })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('reports a failed save', async () => {
    const user = userEvent.setup();
    saveSettings.mockRejectedValue(new Error('nope'));
    render(<LeadPipelineControls />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to save settings')
    );
  });

  it('warns and explains when discovery finds nothing', async () => {
    const user = userEvent.setup();
    runDiscovery.mockResolvedValue(
      result([diagnostic(1, { rawResultCount: 0, linktreeUrlsFound: 0 })])
    );
    const { container } = render(<LeadPipelineControls />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Run Discovery' }));

    expect(
      await screen.findByText('Google CSE returned 0 results for all queries')
    ).toBeVisible();
    expect(toast.warning).toHaveBeenCalledWith(
      'Discovery ran 1 queries but Google returned 0 results. Check keyword configuration.'
    );
    await expectNoA11yViolations(container);
  });

  it('flags partial discovery failures per keyword', async () => {
    const user = userEvent.setup();
    runDiscovery.mockResolvedValue(
      result([
        diagnostic(1),
        diagnostic(2, { error: 'Quota exceeded', rawResultCount: 0 }),
      ])
    );
    const { container } = render(<LeadPipelineControls embedded />, {
      wrapper,
    });

    await user.click(screen.getByRole('button', { name: 'Run Discovery' }));

    expect(
      await screen.findByText('Some queries failed — check Sentry for details')
    ).toBeVisible();
    expect(screen.getByTitle('Quota exceeded')).toHaveTextContent(
      'Quota exceeded'
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Discovery complete: 2 new leads from 2 queries (10 raw results)'
    );
    await expectNoA11yViolations(container);
  });

  it('reports discovery and qualification errors, and qualification success', async () => {
    const user = userEvent.setup();
    runDiscovery.mockRejectedValue(new Error('CSE is offline'));
    runQualification.mockResolvedValueOnce({ message: 'Qualified 4 leads' });
    runQualification.mockRejectedValueOnce('boom');
    render(<LeadPipelineControls hideMainSwitch />, { wrapper });

    expect(
      screen.queryByRole('switch', { name: 'Toggle Pipeline' })
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Run Discovery' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('CSE is offline')
    );

    await user.click(
      screen.getByRole('button', { name: 'Qualify Discovered' })
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Qualified 4 leads')
    );
    await user.click(
      screen.getByRole('button', { name: 'Qualify Discovered' })
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Qualification failed')
    );
  });

  it('keeps a typed number and focus across a re-render and Escape', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<LeadPipelineControls />, { wrapper });
    const cap = screen.getByLabelText('Daily send cap');

    // Typing appends to the current 20.
    await user.type(cap, '5');
    rerender(<LeadPipelineControls hideMainSwitch={false} />);
    await user.keyboard('{Escape}');

    expect(screen.getByLabelText('Daily send cap')).toHaveValue(205);
    expect(screen.getByLabelText('Daily send cap')).toHaveFocus();
  });

  it('stays axe-clean inside a right-to-left page', async () => {
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <LeadPipelineControls />
      </div>,
      { wrapper }
    );

    expect(screen.getByText('Active')).toBeVisible();
    await expectNoA11yViolations(container);
  });
});
