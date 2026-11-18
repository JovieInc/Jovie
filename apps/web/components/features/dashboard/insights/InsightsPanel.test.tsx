import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  useInsightsQueryMock,
  useGenerateInsightsMutationMock,
  generateMock,
  routerPushMock,
} = vi.hoisted(() => ({
  useInsightsQueryMock: vi.fn(),
  useGenerateInsightsMutationMock: vi.fn(),
  generateMock: vi.fn(),
  routerPushMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/lib/queries', () => ({
  useInsightsQuery: useInsightsQueryMock,
  useGenerateInsightsMutation: useGenerateInsightsMutationMock,
  useUpdateInsightMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FetchDeadlineError } from '@/lib/queries/fetch';
import type { InsightResponse } from '@/types/insights';
import { InsightsPanel, InsightsPanelView } from './InsightsPanel';

function makeInsight(
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id: 'insight-1',
    insightType: 'subscriber_surge',
    category: 'growth',
    priority: 'high',
    title: 'Audience growth accelerated',
    description: 'Weekly listeners increased.',
    actionSuggestion: null,
    confidence: '0.92',
    status: 'active',
    periodStart: '2026-08-11T00:00:00.000Z',
    periodEnd: '2026-08-18T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    expiresAt: '2026-09-18T00:00:00.000Z',
    ...overrides,
  };
}

function renderPanel(
  props: Partial<React.ComponentProps<typeof InsightsPanelView>> = {}
) {
  render(
    <TooltipProvider>
      <InsightsPanelView
        insights={[]}
        isLoading={false}
        error={null}
        selectedCategory='all'
        onCategoryChange={vi.fn()}
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
        isGenerating={false}
        {...props}
      />
    </TooltipProvider>
  );
}

describe('InsightsPanelView', () => {
  beforeEach(() => {
    useInsightsQueryMock.mockReset();
    useGenerateInsightsMutationMock.mockReset();
    generateMock.mockReset();
    routerPushMock.mockReset();
    useGenerateInsightsMutationMock.mockReturnValue({
      mutate: generateMock,
      isPending: false,
    });
  });

  it('wraps every category filter inside the compact viewport', () => {
    renderPanel();

    const tablist = screen.getByRole('tablist', {
      name: 'Filter Insights By Category',
    });
    expect(tablist).toHaveClass('flex-wrap');

    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs).toHaveLength(9);
    for (const tab of tabs) {
      expect(tab).toHaveClass('shrink-0');
      expect(tab).not.toHaveClass('flex-1');
    }
  });

  it('uses the canonical workspace empty state without decorative card chrome', () => {
    renderPanel();

    const emptyState = screen.getByTestId('insights-empty-state');
    expect(emptyState.tagName).toBe('OUTPUT');
    expect(emptyState.querySelector('svg')).toBeNull();
    expect(screen.getByText('No Insights Yet')).toHaveClass('text-sm');
  });

  it('renders the canonical recoverable error state', () => {
    const onRetry = vi.fn();
    renderPanel({ error: new Error('Insights request failed'), onRetry });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load insights.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('groups loaded insights by priority without adding extra workspace cards', () => {
    renderPanel({
      insights: [
        makeInsight({
          id: 'high-1',
          priority: 'high',
          category: 'growth',
          insightType: 'subscriber_surge',
        }),
        makeInsight({
          id: 'medium-1',
          priority: 'medium',
          category: 'content',
          insightType: 'release_momentum',
          title: 'Share the new clip',
          description: 'Recent posts are converting.',
          confidence: '0.81',
        }),
      ],
    });

    expect(screen.getByText('High Priority')).toBeVisible();
    expect(screen.getByText('Recommended')).toBeVisible();
    expect(screen.queryByText('Informational')).toBeNull();
    expect(screen.getByText('Audience growth accelerated')).toBeVisible();
  });

  it('connects the workspace filters and generation action to query behavior', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    useInsightsQueryMock.mockReturnValue({
      data: { insights: [] },
      isLoading: false,
      error: null,
      refetch,
    });

    render(
      <TooltipProvider>
        <InsightsPanel />
      </TooltipProvider>
    );

    await user.click(screen.getByRole('tab', { name: 'Growth' }));
    expect(useInsightsQueryMock).toHaveBeenLastCalledWith({
      category: ['growth'],
      limit: 50,
    });

    // An empty category offers Show All; the toolbar still generates.
    expect(screen.getByRole('button', { name: 'Show All' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Generate insights' }));
    expect(generateMock).toHaveBeenCalledOnce();
  });

  it('clears a failed press once the list loads again after it', () => {
    const reset = vi.fn();
    useGenerateInsightsMutationMock.mockReturnValue({
      mutate: generateMock,
      isPending: false,
      isError: true,
      error: new FetchDeadlineError('Request timed out'),
      submittedAt: 1_000,
      reset,
    });
    const query = {
      data: { insights: [] },
      dataUpdatedAt: 500,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    };
    useInsightsQueryMock.mockReturnValue(query);

    const { rerender } = render(
      <TooltipProvider>
        <InsightsPanel />
      </TooltipProvider>
    );
    expect(screen.getByText('Insights Are Still Generating')).toBeVisible();
    expect(reset).not.toHaveBeenCalled();

    // Check Again (or any refetch) lands after the failed press.
    useInsightsQueryMock.mockReturnValue({ ...query, dataUpdatedAt: 2_000 });
    rerender(
      <TooltipProvider>
        <InsightsPanel />
      </TooltipProvider>
    );
    expect(reset).toHaveBeenCalledOnce();
  });

  it('names the click threshold up front instead of vague AI copy', () => {
    renderPanel();

    const empty = screen.getByTestId('insights-empty-state');
    expect(empty).toHaveTextContent('at least 20 link clicks');
    expect(empty).not.toHaveTextContent(/AI-powered|actionable trends/i);
    expect(
      screen.getByRole('link', { name: 'Share Your Profile' })
    ).toHaveAttribute('href', '/app/chat?panel=profile');
  });

  it('explains a generate run that came back short of data, with the real count', () => {
    renderPanel({ lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 6 } });

    expect(screen.getByText('Not Enough Activity Yet')).toBeVisible();
    expect(screen.getByTestId('insights-empty-state')).toHaveTextContent(
      'your profile has 6 link clicks so far'
    );
    // The one next step is sharing, not pressing Generate again.
    expect(
      screen.getByRole('link', { name: 'Share Your Profile' })
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Generate Insights' })
    ).toBeNull();
  });

  it('offers a retry when generation failed', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderPanel({ onGenerate, generateFailed: true });

    expect(screen.getByText('Insights Did Not Generate')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('after a run that found nothing, offers no Generate press the cooldown would refuse', () => {
    renderPanel({
      lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 1240 },
    });
    expect(screen.getByText('Nothing New To Report')).toBeVisible();
    expect(screen.getByTestId('insights-empty-state')).toHaveTextContent(
      'can run again in an hour'
    );
    expect(
      screen.queryByRole('button', { name: /^Generate (Again|Insights)$/ })
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Share Your Profile' })
    ).toBeVisible();
  });

  it('a timeout reads as still working and only refetches the list', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const onGenerate = vi.fn();
    renderPanel({
      onRetry,
      onGenerate,
      generateFailed: true,
      generateFailure: { status: 408, kind: 'deadline' },
    });
    expect(screen.getByText('Insights Are Still Generating')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Check Again' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('a 429 says the cooldown and offers no immediate retry', () => {
    renderPanel({
      generateFailed: true,
      generateFailure: { status: 429, nextAllowedAt: null },
    });
    expect(screen.getByText('Insights Are Cooling Down')).toBeVisible();
    expect(screen.getByTestId('insights-empty-state')).toHaveTextContent(
      'Try again later.'
    );
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Generate Insights' })
    ).toBeNull();
  });

  it('a 403 names the plan and links to billing, not a retry', () => {
    renderPanel({ generateFailed: true, generateFailure: { status: 403 } });
    expect(screen.getByText(/^Insights Need /)).toBeVisible();
    expect(screen.getByRole('link', { name: 'See Plans' })).toHaveAttribute(
      'href',
      '/app/settings/billing'
    );
    expect(screen.queryByRole('button', { name: 'Try Again' })).toBeNull();
  });

  it('any other failure keeps the generic retry', async () => {
    const user = userEvent.setup();
    const onGenerate = vi.fn();
    renderPanel({
      onGenerate,
      generateFailed: true,
      generateFailure: { status: 500 },
    });
    expect(screen.getByText('Insights Did Not Generate')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onGenerate).toHaveBeenCalledOnce();
  });

  it('an empty category speaks to that filter and offers Show All', async () => {
    const user = userEvent.setup();
    const onCategoryChange = vi.fn();
    renderPanel({
      onCategoryChange,
      selectedCategory: 'tour',
      lastRun: { insightsGenerated: 0, dataPointsAnalyzed: 6 },
    });
    expect(screen.getByText('No Tour Insights Yet')).toBeVisible();
    expect(screen.queryByText('Not Enough Activity Yet')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show All' }));
    expect(onCategoryChange).toHaveBeenCalledWith('all');
  });

  it('loads in the same rows as a loaded insight card, under the same filters', () => {
    const { container } = render(
      <TooltipProvider>
        <InsightsPanelView
          insights={[]}
          isLoading
          error={null}
          selectedCategory='all'
          onCategoryChange={vi.fn()}
          onGenerate={vi.fn()}
          onRetry={vi.fn()}
          isGenerating={false}
        />
      </TooltipProvider>
    );

    expect(
      within(
        screen.getByRole('tablist', { name: 'Filter Insights By Category' })
      ).getAllByRole('tab')
    ).toHaveLength(9);
    const rows = screen.getByTestId('insights-loading-rows');
    const firstRow = rows.querySelector('.border-b');
    expect(firstRow).toHaveClass('px-1', 'py-3.5');
    expect(rows.querySelector('.h-7.w-7')).not.toBeNull();
    expect(container.querySelector('.p-4')).toBeNull();
    expect(screen.queryByTestId('insights-empty-state')).toBeNull();
  });

  it('uses the typographic ellipsis while generating', () => {
    renderPanel({ isGenerating: true });

    expect(screen.getByRole('button', { name: 'Generating…' })).toBeDisabled();
    expect(document.body.textContent).not.toContain('...');
  });

  describe('audience workspace navigation', () => {
    const NAV_STATES: {
      name: string;
      props: Partial<React.ComponentProps<typeof InsightsPanelView>>;
    }[] = [
      { name: 'loading', props: { isLoading: true } },
      { name: 'error', props: { error: new Error('Insights request failed') } },
      { name: 'empty', props: {} },
      { name: 'populated', props: { insights: [makeInsight()] } },
    ];

    it('keeps Contacts, Audience and Insights reachable in every panel state', () => {
      for (const state of NAV_STATES) {
        const { unmount } = render(
          <TooltipProvider>
            <InsightsPanelView
              insights={[]}
              isLoading={false}
              error={null}
              selectedCategory='all'
              onCategoryChange={vi.fn()}
              onGenerate={vi.fn()}
              onRetry={vi.fn()}
              isGenerating={false}
              {...state.props}
            />
          </TooltipProvider>
        );

        const tablist = screen.getByRole('tablist', {
          name: 'Audience Workspace',
        });
        expect(tablist).toBeVisible();
        for (const label of ['Contacts', 'Audience', 'Insights']) {
          expect(
            within(tablist).getByRole('tab', { name: label })
          ).toBeVisible();
        }
        expect(
          within(tablist).getByRole('tab', { name: 'Insights' })
        ).toHaveAttribute('aria-selected', 'true');
        expect(
          within(tablist).getByRole('tab', { name: 'Contacts' })
        ).toHaveAttribute('aria-selected', 'false');

        unmount();
      }
    });

    it('routes Contacts and Audience through the canonical workspace hrefs', async () => {
      const user = userEvent.setup();
      renderPanel();

      await user.click(screen.getByRole('tab', { name: 'Contacts' }));
      expect(routerPushMock).toHaveBeenCalledWith('/app/contacts');
      await user.click(screen.getByRole('tab', { name: 'Audience' }));
      expect(routerPushMock).toHaveBeenCalledWith('/app/contacts?tab=audience');
    });

    it('keeps canonical keyboard focus movement and routes on activation', async () => {
      const user = userEvent.setup();
      renderPanel();

      const insights = screen.getByRole('tab', { name: 'Insights' });
      insights.focus();
      expect(insights).toHaveFocus();
      await user.keyboard('{ArrowLeft}');
      const audience = screen.getByRole('tab', { name: 'Audience' });
      expect(audience).toHaveFocus();
      await user.keyboard('{Enter}');
      expect(routerPushMock).toHaveBeenCalledWith('/app/contacts?tab=audience');
    });

    it('preserves the category filters and Generate beside the workspace tabs', () => {
      renderPanel();

      expect(
        screen.getByRole('tablist', { name: 'Filter Insights By Category' })
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Generate insights' })
      ).toBeVisible();
    });
  });
});
