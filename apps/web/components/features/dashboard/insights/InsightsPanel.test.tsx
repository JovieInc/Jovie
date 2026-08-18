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
    expect(screen.getByText('No Insights Yet')).toHaveClass('text-2xl');
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
});
