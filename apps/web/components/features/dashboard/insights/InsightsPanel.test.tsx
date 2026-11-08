import { TooltipProvider } from '@jovie/ui';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { useInsightsQueryMock, useGenerateInsightsMutationMock, generateMock } =
  vi.hoisted(() => ({
    useInsightsQueryMock: vi.fn(),
    useGenerateInsightsMutationMock: vi.fn(),
    generateMock: vi.fn(),
  }));

vi.mock('@/lib/queries', () => ({
  useInsightsQuery: useInsightsQueryMock,
  useGenerateInsightsMutation: useGenerateInsightsMutationMock,
  useUpdateInsightMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { InsightsPanel, InsightsPanelView } from './InsightsPanel';

describe('InsightsPanelView', () => {
  beforeEach(() => {
    useInsightsQueryMock.mockReset();
    useGenerateInsightsMutationMock.mockReset();
    generateMock.mockReset();
    useGenerateInsightsMutationMock.mockReturnValue({
      mutate: generateMock,
      isPending: false,
    });
  });

  it('wraps every category filter inside the compact viewport', () => {
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
        />
      </TooltipProvider>
    );

    const tablist = screen.getByRole('tablist', {
      name: 'Filter Insights By Category',
    });
    expect(tablist).toHaveClass('flex-wrap', 'gap-1.5');

    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(9);
    for (const tab of tabs) {
      expect(tab).toHaveClass('shrink-0');
      expect(tab).not.toHaveClass('flex-1');
    }
  });

  it('uses the canonical workspace empty state without decorative card chrome', () => {
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
        />
      </TooltipProvider>
    );

    const emptyState = screen.getByTestId('insights-empty-state');
    expect(emptyState.tagName).toBe('OUTPUT');
    expect(emptyState.querySelector('svg')).toBeNull();
    expect(screen.getByText('No Insights Yet')).toHaveClass('text-sm');
  });

  it('renders the canonical recoverable error state', () => {
    const onRetry = vi.fn();
    render(
      <TooltipProvider>
        <InsightsPanelView
          insights={[]}
          isLoading={false}
          error={new Error('Insights request failed')}
          selectedCategory='all'
          onCategoryChange={vi.fn()}
          onGenerate={vi.fn()}
          onRetry={onRetry}
          isGenerating={false}
        />
      </TooltipProvider>
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Failed to load insights.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry load' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('groups loaded insights by priority without adding extra workspace cards', () => {
    render(
      <TooltipProvider>
        <InsightsPanelView
          insights={[
            {
              id: 'high-1',
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
            },
            {
              id: 'medium-1',
              insightType: 'release_momentum',
              category: 'content',
              priority: 'medium',
              title: 'Share the new clip',
              description: 'Recent posts are converting.',
              actionSuggestion: null,
              confidence: '0.81',
              status: 'active',
              periodStart: '2026-08-11T00:00:00.000Z',
              periodEnd: '2026-08-18T00:00:00.000Z',
              createdAt: '2026-08-18T00:00:00.000Z',
              expiresAt: '2026-09-18T00:00:00.000Z',
            },
          ]}
          isLoading={false}
          error={null}
          selectedCategory='all'
          onCategoryChange={vi.fn()}
          onGenerate={vi.fn()}
          onRetry={vi.fn()}
          isGenerating={false}
        />
      </TooltipProvider>
    );

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

    await user.click(screen.getByRole('button', { name: 'Generate Insights' }));
    expect(generateMock).toHaveBeenCalledOnce();
  });

  it('names the click threshold up front instead of vague AI copy', () => {
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
        />
      </TooltipProvider>
    );

    const empty = screen.getByTestId('insights-empty-state');
    expect(empty).toHaveTextContent('at least 20 link clicks');
    expect(empty).not.toHaveTextContent(/AI-powered|actionable trends/i);
    expect(
      screen.getByRole('link', { name: 'Share Your Profile' })
    ).toHaveAttribute('href', '/app/chat?panel=profile');
  });

  it('explains a generate run that came back short of data, with the real count', () => {
    const onGenerate = vi.fn();
    render(
      <TooltipProvider>
        <InsightsPanelView
          insights={[]}
          isLoading={false}
          error={null}
          selectedCategory='all'
          onCategoryChange={vi.fn()}
          onGenerate={onGenerate}
          onRetry={vi.fn()}
          isGenerating={false}
          lastRun={{ insightsGenerated: 0, dataPointsAnalyzed: 6 }}
        />
      </TooltipProvider>
    );

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
    render(
      <TooltipProvider>
        <InsightsPanelView
          insights={[]}
          isLoading={false}
          error={null}
          selectedCategory='all'
          onCategoryChange={vi.fn()}
          onGenerate={onGenerate}
          onRetry={vi.fn()}
          isGenerating={false}
          generateFailed
        />
      </TooltipProvider>
    );

    expect(screen.getByText('Insights Did Not Generate')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(onGenerate).toHaveBeenCalledOnce();
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

    expect(screen.getAllByRole('tab')).toHaveLength(9);
    const rows = screen.getByTestId('insights-loading-rows');
    const firstRow = rows.querySelector('.border-b');
    expect(firstRow).toHaveClass('px-1', 'py-3.5');
    expect(rows.querySelector('.h-7.w-7')).not.toBeNull();
    expect(container.querySelector('.p-4')).toBeNull();
    expect(screen.queryByTestId('insights-empty-state')).toBeNull();
  });
});
