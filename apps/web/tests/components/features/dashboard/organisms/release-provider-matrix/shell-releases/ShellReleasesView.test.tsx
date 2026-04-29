import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ShellReleasesView } from '@/components/features/dashboard/organisms/release-provider-matrix/shell-releases/ShellReleasesView';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import type { ReleaseViewModel } from '@/lib/discography/types';

vi.mock('@/app/app/(shell)/dashboard/releases/actions', () => ({
  revertReleaseArtwork: vi.fn(),
}));

vi.mock('@/lib/queries', () => {
  const mutation = {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
  };

  return {
    useFormatReleaseLyricsMutation: () => mutation,
    useRefreshReleaseMutation: () => mutation,
    useRescanIsrcLinksMutation: () => mutation,
    useResetProviderOverrideMutation: () => mutation,
    useSaveCanvasStatusMutation: () => mutation,
    useSavePrimaryIsrcMutation: () => mutation,
    useSaveProviderOverrideMutation: () => mutation,
    useSaveReleaseLyricsMutation: () => mutation,
    useSaveReleaseMetadataMutation: () => mutation,
    useSaveReleaseTargetPlaylistsMutation: () => mutation,
    useSyncReleasesFromSpotifyMutation: () => mutation,
  };
});

vi.mock('@/components/atoms/table-action-menu/TableActionMenu', () => ({
  TableActionMenu: ({
    children,
    items,
  }: {
    children: React.ReactNode;
    items: Array<{
      id: string;
      label: string;
      onClick?: () => void;
      children?: Array<{ id: string; label: string; onClick?: () => void }>;
    }>;
  }) => (
    <div>
      {children}
      <div data-testid='mock-release-actions'>
        {items
          .flatMap(item =>
            item.children && item.children.length > 0 ? item.children : [item]
          )
          .map(item => (
            <button
              key={item.id}
              type='button'
              onClick={event => {
                event.stopPropagation();
                item.onClick?.();
              }}
            >
              {item.label}
            </button>
          ))}
      </div>
    </div>
  ),
}));

vi.mock('@/components/organisms/release-sidebar', () => ({
  ReleaseSidebar: ({
    release,
    onClose,
    onReleaseChange,
  }: {
    release: ReleaseViewModel | null;
    onClose?: () => void;
    onReleaseChange?: (release: ReleaseViewModel) => void;
  }) =>
    release ? (
      <aside data-testid='release-sidebar'>
        <div>{release.title}</div>
        <button type='button' onClick={onClose}>
          Close
        </button>
        <button
          type='button'
          onClick={() => onReleaseChange?.({ ...release, title: 'Edited' })}
        >
          Save Edit
        </button>
      </aside>
    ) : null,
}));

vi.mock('@/hooks/useClipboard', () => ({
  copyToClipboard: vi.fn(() => Promise.resolve(true)),
}));

function fakeRelease(
  partial: Partial<ReleaseViewModel> & { id: string; title: string }
): ReleaseViewModel {
  return {
    profileId: 'p',
    artistNames: ['Bahamas'],
    status: 'released',
    artworkUrl: 'https://x.invalid/a.jpg',
    slug: partial.title.toLowerCase().replace(/\s+/g, '-'),
    smartLinkPath: `/${partial.title.toLowerCase().replace(/\s+/g, '-')}`,
    providers: [],
    releaseType: 'single',
    isExplicit: false,
    totalTracks: 1,
    ...partial,
  } as ReleaseViewModel;
}

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1db954' },
} as Parameters<typeof ShellReleasesView>[0]['providerConfig'];

const primaryProviders: Parameters<
  typeof ShellReleasesView
>[0]['primaryProviders'] = ['spotify'];

function RightPanelProbe() {
  const panel = useRightPanel();
  return <div data-testid='right-panel-probe'>{panel}</div>;
}

function HeaderActionsProbe() {
  const { headerActions } = useHeaderActions();
  return <div data-testid='header-actions-probe'>{headerActions}</div>;
}

function renderShell(releases: readonly ReleaseViewModel[]) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <HeaderActionsProvider>
        <RightPanelProvider>
          <ShellReleasesView
            releases={releases}
            providerConfig={providerConfig}
            primaryProviders={primaryProviders}
            artistName='Bahamas'
          />
          <HeaderActionsProbe />
          <RightPanelProbe />
        </RightPanelProvider>
      </HeaderActionsProvider>
    </QueryClientProvider>
  );
}

describe('ShellReleasesView', () => {
  it('renders one row per release with title + artist', () => {
    renderShell([
      fakeRelease({ id: '1', title: 'Lost in the Light' }),
      fakeRelease({
        id: '2',
        title: 'Take Me Over',
        artistNames: ['Other'],
      }),
    ]);
    expect(screen.getByText('Lost in the Light')).toBeInTheDocument();
    expect(screen.getByText('Take Me Over')).toBeInTheDocument();
    expect(screen.getByText('Bahamas')).toBeInTheDocument();
    expect(screen.getByText('Other')).toBeInTheDocument();
  });

  it('shows the empty state when there are no releases', () => {
    renderShell([]);
    expect(screen.getByText(/No releases yet/)).toBeInTheDocument();
  });

  it('opens and dismisses the production release drawer from a row', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    const row = screen.getByRole('option', { name: /Lost in the Light/ });
    expect(row).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
      'Lost in the Light'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(row).toHaveAttribute('aria-selected', 'false');
      expect(screen.queryByTestId('release-sidebar')).not.toBeInTheDocument();
    });
  });

  it('keeps selected row in sync when the drawer edits a release', async () => {
    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(screen.getByRole('option', { name: /Lost in the Light/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save Edit' }));

    expect(screen.getByRole('option', { name: /Edited/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('exposes production row actions for edit and smart-link copy', async () => {
    const { copyToClipboard } = await import('@/hooks/useClipboard');

    renderShell([fakeRelease({ id: 'r1', title: 'Lost in the Light' })]);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Release actions for Lost in the Light',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit release links' }));

    expect(await screen.findByTestId('release-sidebar')).toHaveTextContent(
      'Lost in the Light'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy smart link' }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('/lost-in-the-light')
      );
    });
  });

  it('shows a count when filtered down', () => {
    renderShell([
      fakeRelease({ id: '1', title: 'Alpha' }),
      fakeRelease({ id: '2', title: 'Beta' }),
    ]);
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
