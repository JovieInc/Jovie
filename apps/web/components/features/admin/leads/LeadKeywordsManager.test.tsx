import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LeadKeywordsManager } from './LeadKeywordsManager';

const query = vi.hoisted(() => ({ resultsFoundTotal: 0 }));

vi.mock('@/lib/queries', () => ({
  queryKeys: {
    admin: { leads: { keywords: () => ['admin', 'leads', 'keywords'] } },
  },
  useLeadKeywordsQuery: () => ({
    isLoading: false,
    data: {
      keywords: [
        {
          id: 'keyword',
          query: 'music',
          enabled: true,
          resultsFoundTotal: query.resultsFoundTotal,
          lastUsedAt: null,
        },
      ],
    },
  }),
  useAddLeadKeywordsMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useDeleteLeadKeywordMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useSeedLeadKeywordsMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useToggleLeadKeywordMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

afterEach(cleanup);

describe('lead keyword result counts', () => {
  it.each([
    [0, '0 Results'],
    [1, '1 Result'],
    [2, '2 Results'],
  ])('renders %i matching results with an agreeing noun', (count, label) => {
    query.resultsFoundTotal = Number(count);
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LeadKeywordsManager />
      </QueryClientProvider>
    );
    expect(screen.getByText(String(label), { exact: true })).toBeVisible();
  });
});
