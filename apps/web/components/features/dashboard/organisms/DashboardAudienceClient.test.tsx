import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDestinationReady } = vi.hoisted(() => ({
  mockDestinationReady: vi.fn(),
}));

vi.mock('nuqs', () => {
  const createParser = () => {
    const parser = {
      withDefault: () => parser,
      withOptions: () => parser,
    };
    return parser;
  };

  return {
    parseAsArrayOf: createParser,
    parseAsString: createParser(),
    parseAsStringLiteral: createParser,
    useQueryState: () => [null, vi.fn()],
    useQueryStates: () => [{}, vi.fn()],
  };
});

vi.mock('@/components/features/dashboard/NavigationDestinationReady', () => ({
  NavigationDestinationReady: (props: unknown) => {
    mockDestinationReady(props);
    return null;
  },
}));

vi.mock('@/components/organisms/DashboardErrorFallback', () => ({
  DashboardErrorFallback: () => null,
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock('@/lib/nuqs', () => ({
  audienceSortFields: ['lastSeen'],
  audienceViews: ['all'],
}));

vi.mock('@/lib/queries', () => ({
  QueryErrorBoundary: ({ children }: { children: ReactNode }) => children,
  useAudienceInfiniteQuery: ({ initialData }: { initialData: unknown }) => ({
    data: { pages: [initialData] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));

vi.mock('./AudiencePanelContext', () => ({
  AudiencePanelProvider: ({ children }: { children: ReactNode }) => children,
  useAudiencePanel: () => ({
    mode: null,
    open: vi.fn(),
    close: vi.fn(),
  }),
}));

vi.mock('./DashboardAudienceWorkspace', () => ({
  DashboardAudienceWorkspace: () => <div>Audience workspace</div>,
}));

import { DashboardAudienceClient } from './DashboardAudienceClient';

describe('DashboardAudienceClient', () => {
  beforeEach(() => {
    mockDestinationReady.mockReset();
  });

  it('marks the query-backed Audience destination ready after it renders', () => {
    render(
      <DashboardAudienceClient
        mode='members'
        view='all'
        initialRows={[]}
        total={0}
        page={1}
        pageSize={25}
        sort='lastSeen'
        direction='desc'
        subscriberCount={0}
        totalAudienceCount={0}
        filters={{ segments: [] }}
      />
    );

    expect(mockDestinationReady).toHaveBeenCalledExactlyOnceWith({
      destination: 'contacts',
    });
  });
});
