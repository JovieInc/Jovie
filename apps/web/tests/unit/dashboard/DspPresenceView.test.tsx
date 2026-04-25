import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DspPresenceData,
  DspPresenceItem,
} from '@/app/app/(shell)/dashboard/presence/actions';
import { DspPresenceView } from '@/features/dashboard/organisms/dsp-presence/DspPresenceView';

const {
  mockInvalidateQueries,
  mockSetTableMeta,
  mockUseDashboardData,
  mockUseDspEnrichmentStatusQuery,
  mockUseRegisterRightPanel,
} = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockSetTableMeta: vi.fn(),
  mockUseDashboardData: vi.fn(),
  mockUseDspEnrichmentStatusQuery: vi.fn(),
  mockUseRegisterRightPanel: vi.fn(),
}));

let latestOnComplete: (() => void) | undefined;

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<object>('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

vi.mock('@/app/app/(shell)/dashboard/DashboardDataContext', () => ({
  DashboardDataContext: {
    Provider: ({ children }: { children: React.ReactNode }) => children,
    Consumer: () => null,
    displayName: 'DashboardDataContext',
  },
  useDashboardData: mockUseDashboardData,
}));

vi.mock('@/components/organisms/AuthShellWrapper', () => ({
  useTableMeta: () => ({
    setTableMeta: mockSetTableMeta,
  }),
}));

vi.mock('@/hooks/useRegisterRightPanel', () => ({
  useRegisterRightPanel: mockUseRegisterRightPanel,
}));

vi.mock('@/lib/queries/useDspEnrichmentStatusQuery', () => ({
  useDspEnrichmentStatusQuery: (
    options: Readonly<{ onComplete?: () => void }>
  ) => {
    latestOnComplete = options.onComplete;
    return mockUseDspEnrichmentStatusQuery(options);
  },
}));

vi.mock('@/components/organisms/PageShell', () => ({
  PageShell: ({
    children,
    toolbar,
    ...props
  }: {
    children: ReactNode;
    toolbar: ReactNode;
  }) => (
    <div {...props}>
      <div data-testid='presence-toolbar'>{toolbar}</div>
      {children}
    </div>
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/dsp-presence/DspPresenceSummary',
  () => ({
    DspPresenceSummary: ({
      confirmedCount,
      suggestedCount,
      onAddPlatform,
    }: {
      confirmedCount: number;
      suggestedCount: number;
      onAddPlatform: () => void;
    }) => (
      <div>
        Summary {confirmedCount}/{suggestedCount}
        <button type='button' onClick={onAddPlatform}>
          Open Add Platform
        </button>
      </div>
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/dsp-presence/DspPresenceEmptyState',
  () => ({
    DspPresenceEmptyState: ({
      onAddPlatform,
    }: {
      onAddPlatform: () => void;
    }) => (
      <div data-testid='presence-empty-state'>
        Empty state
        <button type='button' onClick={onAddPlatform}>
          Empty State Add Platform
        </button>
      </div>
    ),
  })
);

vi.mock(
  '@/features/dashboard/organisms/dsp-presence/AddPlatformDialog',
  () => ({
    AddPlatformDialog: ({ open }: { open: boolean }) =>
      open ? <div>Dialog Open</div> : null,
  })
);

vi.mock('@/features/dashboard/organisms/dsp-presence/DspPresenceTable', () => ({
  DspPresenceTable: ({
    items,
    onRowSelect,
  }: {
    items: DspPresenceItem[];
    onRowSelect: (item: DspPresenceItem) => void;
  }) => (
    <div>
      {items.map(item => (
        <button
          key={item.matchId}
          type='button'
          onClick={() => onRowSelect(item)}
        >
          {item.externalArtistName ?? item.matchId}
        </button>
      ))}
    </div>
  ),
}));

vi.mock(
  '@/features/dashboard/organisms/dsp-presence/DspPresenceSidebar',
  () => ({
    DspPresenceSidebar: ({
      item,
      onClose,
    }: {
      item: DspPresenceItem | null;
      onClose: () => void;
    }) =>
      item ? (
        <div>
          <div>Sidebar {item.matchId}</div>
          <button type='button' onClick={onClose}>
            Close Sidebar
          </button>
        </div>
      ) : null,
  })
);

const baseItem: DspPresenceItem = {
  matchId: 'match-1',
  providerId: 'spotify',
  externalArtistName: 'Midnight Echo',
  externalArtistUrl: 'https://open.spotify.com/artist/123',
  externalArtistImageUrl: null,
  confidenceScore: 0.91,
  confidenceBreakdown: null,
  matchingIsrcCount: 7,
  status: 'suggested',
  matchSource: 'musicfetch',
  confirmedAt: null,
};

function renderView(data: DspPresenceData) {
  return render(<DspPresenceView data={data} />);
}

describe('DspPresenceView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestOnComplete = undefined;
    mockUseDashboardData.mockReturnValue({
      selectedProfile: {
        id: 'profile-123',
        spotifyId: 'spotify-artist-123',
      },
      isAdmin: false,
    });
    mockUseDspEnrichmentStatusQuery.mockReturnValue({ data: undefined });
  });

  it('renders the empty state when there are no presence items', () => {
    renderView({
      items: [],
      confirmedCount: 0,
      suggestedCount: 0,
    });

    expect(screen.getByTestId('dsp-presence-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('presence-empty-state')).toBeInTheDocument();
    expect(mockSetTableMeta).toHaveBeenCalledWith({
      rowCount: 0,
      toggle: null,
      rightPanelWidth: 0,
    });
  });

  it('opens and closes the sidebar from row clicks', async () => {
    const user = userEvent.setup();

    renderView({
      items: [baseItem],
      confirmedCount: 0,
      suggestedCount: 1,
    });

    await user.click(screen.getByRole('button', { name: 'Midnight Echo' }));
    expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Midnight Echo' }));
    expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('clears stale selection when the selected row disappears', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DspPresenceView
        data={{
          items: [baseItem],
          confirmedCount: 0,
          suggestedCount: 1,
        }}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Midnight Echo' }));
    expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).not.toBeNull();

    rerender(
      <DspPresenceView
        data={{
          items: [],
          confirmedCount: 0,
          suggestedCount: 0,
        }}
      />
    );

    expect(mockUseRegisterRightPanel.mock.calls.at(-1)?.[0]).toBeNull();
  });

  it('invalidates presence cache when enrichment completion callback fires', () => {
    renderView({
      items: [baseItem],
      confirmedCount: 0,
      suggestedCount: 1,
    });

    act(() => {
      latestOnComplete?.();
    });

    expect(mockInvalidateQueries).toHaveBeenCalledTimes(1);
  });

  it('opens the add-platform dialog from the empty state CTA', async () => {
    const user = userEvent.setup();

    renderView({
      items: [],
      confirmedCount: 0,
      suggestedCount: 0,
    });

    await user.click(
      screen.getByRole('button', { name: 'Empty State Add Platform' })
    );

    await waitFor(() => {
      expect(screen.getByText('Dialog Open')).toBeInTheDocument();
    });
  });
});
