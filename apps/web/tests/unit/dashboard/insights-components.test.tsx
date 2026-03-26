import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InsightCard } from '@/features/dashboard/insights/InsightCard';
import { InsightsBadge } from '@/features/dashboard/insights/InsightsBadge';
import { InsightsSummaryWidget } from '@/features/dashboard/insights/InsightsSummaryWidget';
import { useInsightsSummaryQuery } from '@/lib/queries';
import type { InsightResponse } from '@/types/insights';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/queries', () => ({
  useInsightsSummaryQuery: vi.fn(),
}));

vi.mock('@/features/dashboard/insights/InsightCategoryIcon', () => ({
  InsightCategoryIcon: ({ category }: { category: string }) => (
    <span>{category}-icon</span>
  ),
}));

vi.mock('@/features/dashboard/insights/InsightActions', () => ({
  InsightActions: ({ insightId }: { insightId: string }) => (
    <div>actions-{insightId}</div>
  ),
}));

const useInsightsSummaryQueryMock = vi.mocked(useInsightsSummaryQuery);

function createInsight(
  overrides: Partial<InsightResponse> = {}
): InsightResponse {
  return {
    id: 'insight-1',
    insightType: 'city_growth',
    category: 'growth',
    priority: 'high',
    title: 'Fans in Austin are trending up',
    description: 'Austin traffic increased week over week.',
    actionSuggestion: 'Schedule a show announcement for Austin.',
    confidence: '0.87',
    status: 'active',
    periodStart: '2026-03-01T00:00:00.000Z',
    periodEnd: '2026-03-07T00:00:00.000Z',
    createdAt: '2026-03-08T00:00:00.000Z',
    expiresAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('insights surfaces', () => {
  it('hides the sidebar badge when there are no active insights', () => {
    useInsightsSummaryQueryMock.mockReturnValue({
      data: { totalActive: 0, insights: [], lastGeneratedAt: null },
      isLoading: false,
    } as never);

    const { container } = render(<InsightsBadge />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the summary widget with the count and top insight copy', () => {
    useInsightsSummaryQueryMock.mockReturnValue({
      data: {
        totalActive: 2,
        insights: [createInsight()],
        lastGeneratedAt: '2026-03-08T00:00:00.000Z',
      },
      isLoading: false,
    } as never);

    render(<InsightsSummaryWidget />);

    expect(screen.getByText('AI Insights')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(
      screen.getByText('Fans in Austin are trending up')
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Schedule a show announcement for Austin\./)
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View all/i })).toHaveAttribute(
      'href',
      '/app/insights'
    );
  });

  it('renders the insight card metadata and action suggestion', () => {
    render(<InsightCard insight={createInsight()} />);

    expect(
      screen.getByText('Fans in Austin are trending up')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Schedule a show announcement for Austin.')
    ).toBeInTheDocument();
    expect(screen.getByText('High priority')).toBeInTheDocument();
    expect(screen.getByText('actions-insight-1')).toBeInTheDocument();
    expect(screen.getByText('Confidence: 87%')).toBeInTheDocument();
  });
});
