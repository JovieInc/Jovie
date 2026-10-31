import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDestinationReady,
  mockPanelOpen,
  mockPanelClose,
  mockQueryBehavior,
} = vi.hoisted(() => ({
  mockDestinationReady: vi.fn(),
  mockPanelOpen: vi.fn(),
  mockPanelClose: vi.fn(),
  // 'throw' simulates useAudienceInfiniteQuery's throwOnError surfacing a
  // failed fetch during render (retry: false in lib/queries/audience-infinite).
  mockQueryBehavior: { current: 'ok' as 'ok' | 'throw' },
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
  DashboardErrorFallback: ({ reset }: { reset: () => void }) => (
    <button type='button' onClick={reset}>
      Try again
    </button>
  ),
}));

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: () => false,
}));

vi.mock('@/lib/nuqs', () => {
  const parser = {
    withOptions: () => parser,
    withDefault: () => parser,
  };
  return {
    audiencePanelParser: parser,
    audienceSortFields: ['lastSeen'],
    audienceViews: ['all'],
  };
});

// The boundary stays REAL so the JOV-8791 regression (a throwing query hook
// rendering a blank route because the boundary sat inside the throwing
// component) is exercised for its actual behavior. Only the data hook is
// stubbed.
vi.mock('@/lib/queries', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/queries')>();
  return {
    ...actual,
    useAudienceInfiniteQuery: ({ initialData }: { initialData: unknown }) => {
      if (mockQueryBehavior.current === 'throw') {
        throw new Error('Service unavailable');
      }
      return {
        data: { pages: [initialData] },
        hasNextPage: false,
        isFetchingNextPage: false,
        fetchNextPage: vi.fn(),
      };
    },
  };
});

vi.mock('./AudiencePanelContext', () => ({
  AudiencePanelProvider: ({ children }: { children: ReactNode }) => children,
  ControlledAudiencePanelProvider: ({ children }: { children: ReactNode }) =>
    children,
  useAudiencePanel: () => ({
    mode: null,
    open: mockPanelOpen,
    close: mockPanelClose,
    toggle: vi.fn(),
  }),
}));

vi.mock('./DashboardAudienceWorkspace', () => ({
  DashboardAudienceWorkspace: () => <div>Audience workspace</div>,
}));

import { DashboardAudienceClient } from './DashboardAudienceClient';

function renderClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}

describe('DashboardAudienceClient', () => {
  beforeEach(() => {
    mockDestinationReady.mockReset();
    mockPanelOpen.mockReset();
    mockPanelClose.mockReset();
    mockQueryBehavior.current = 'ok';
  });

  it('never opens a secondary panel implicitly on mount', () => {
    renderClient();

    // JOV-5836: panel state must come from the explicit `panel` URL param or
    // a user action — never from navigation alone.
    expect(mockPanelOpen).not.toHaveBeenCalled();
    expect(mockPanelClose).not.toHaveBeenCalled();
  });

  it('marks the query-backed Audience destination ready after it renders', () => {
    renderClient();

    expect(mockDestinationReady).toHaveBeenCalledExactlyOnceWith({
      destination: 'contacts',
    });
  });

  it('shows the error fallback when the audience query throws during render', () => {
    // JOV-8791 / resilience.spec.ts 'audience page shows error UI (not blank)
    // when audience API returns 500': the boundary must catch the hook throw.
    // With the boundary inside DashboardAudienceClientInner this render
    // propagated out of the component instead (no boundary mounted yet).
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockQueryBehavior.current = 'throw';
    try {
      renderClient();

      expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
      expect(screen.queryByText('Audience workspace')).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('recovers to the workspace when retry succeeds after a query failure', () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    mockQueryBehavior.current = 'throw';
    try {
      renderClient();
      expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();

      // The next fetch succeeds: resetting the boundary re-renders the inner
      // surface and the query-backed content returns.
      mockQueryBehavior.current = 'ok';
      fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(screen.getByText('Audience workspace')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });
});
