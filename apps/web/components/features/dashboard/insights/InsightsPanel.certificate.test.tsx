import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/app/insights',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/lib/queries', () => ({
  useInsightsQuery: vi.fn(),
  useGenerateInsightsMutation: vi.fn(),
  useUpdateInsightMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { InsightResponse } from '@/types/insights';
import { InsightsPanelView } from './InsightsPanel';

function makeInsight(
  id: string,
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id,
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

function renderView(
  props: Partial<React.ComponentProps<typeof InsightsPanelView>> = {},
  dir?: 'rtl'
) {
  const handlers = {
    onCategoryChange: vi.fn(),
    onGenerate: vi.fn(),
    onRetry: vi.fn(),
  };
  const result = render(
    <TooltipProvider>
      <div dir={dir}>
        <InsightsPanelView
          insights={[]}
          isLoading={false}
          error={null}
          selectedCategory='all'
          isGenerating={false}
          {...handlers}
          {...props}
        />
      </div>
    </TooltipProvider>
  );
  return { ...result, handlers };
}

describe('InsightsPanel certificate', () => {
  it('keeps the empty workspace axe-clean and generates on press', async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderView();
    await expectNoA11yViolations(container);

    await user.click(screen.getByRole('button', { name: 'Generate insights' }));
    expect(handlers.onGenerate).toHaveBeenCalled();
  });

  it('keeps the loading rows axe-clean', async () => {
    const { container } = renderView({ isLoading: true });

    expect(screen.getByTestId('insights-loading-rows')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    await expectNoA11yViolations(container);
  });

  it('keeps the error state axe-clean and retries on press', async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderView({
      error: new Error('Insights request failed'),
    });
    await expectNoA11yViolations(container);

    const retry = screen
      .getAllByRole('button')
      .find(button => /try again|retry/i.test(button.textContent ?? ''));
    expect(retry).toBeDefined();
    await user.click(retry as HTMLElement);
    expect(handlers.onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a partial list with only one priority group', async () => {
    const { container } = renderView({
      insights: [
        makeInsight('m-1', { priority: 'medium', title: 'Berlin doubled' }),
      ],
    });

    expect(
      screen.getByRole('article', { name: 'Medium insight: Berlin doubled' })
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await expectNoA11yViolations(container);
  });

  it('renders many long insights and filters by category', async () => {
    const user = userEvent.setup();
    const title =
      'Listeners in São Paulo, Mexico City and Bogotá more than doubled after the remix landed';
    const { container, handlers } = renderView({
      insights: ['high', 'medium', 'low'].map((priority, index) =>
        makeInsight(`i-${index}`, {
          priority: priority as InsightResponse['priority'],
          title: `${title} ${index}`,
        })
      ),
    });

    expect(screen.getAllByRole('article')).toHaveLength(3);
    await expectNoA11yViolations(container);
    await user.click(
      screen.getByRole('button', { name: 'Category: All Categories' })
    );
    await user.click(screen.getByRole('menuitemradio', { name: 'Tour' }));
    expect(handlers.onCategoryChange).toHaveBeenCalledWith('tour');
  });

  it('reads a lost Generate reply as still working', async () => {
    const { container } = renderView({
      generateFailed: true,
      generateFailure: { status: null, kind: 'network' },
    });

    expect(
      screen.getByText('Insights Are Still Generating')
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });

  it('names the plan when Generate is gated', async () => {
    const { container } = renderView({
      generateFailed: true,
      generateFailure: { status: 403 },
    });

    expect(
      screen.getByRole('link', { name: /plan|upgrade|billing/i })
    ).toBeVisible();
    await expectNoA11yViolations(container);
  });

  it('stays accessible in a right-to-left document', async () => {
    const { container } = renderView(
      {
        insights: [makeInsight('rtl-1', { title: 'تسارع نمو الجمهور' })],
      },
      'rtl'
    );

    expect(
      screen.getByRole('article', {
        name: 'High priority insight: تسارع نمو الجمهور',
      })
    ).toBeInTheDocument();
    await expectNoA11yViolations(container);
  });
});
