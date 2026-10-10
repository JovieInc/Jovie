import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDestinationReady, mockPanelOpen, mockPanelClose } = vi.hoisted(
  () => ({
    mockDestinationReady: vi.fn(),
    mockPanelOpen: vi.fn(),
    mockPanelClose: vi.fn(),
  })
);

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

describe('DashboardAudienceClient', () => {
  beforeEach(() => {
    mockDestinationReady.mockReset();
    mockPanelOpen.mockReset();
    mockPanelClose.mockReset();
  });

  it('never opens a secondary panel implicitly on mount', () => {
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

    // JOV-5836: panel state must come from the explicit `panel` URL param or
    // a user action — never from navigation alone.
    expect(mockPanelOpen).not.toHaveBeenCalled();
    expect(mockPanelClose).not.toHaveBeenCalled();
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
