import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useCallback, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReleaseLikeRow } from '@/components/jovie/components/entity-mappers';
import { SlashCommandMenu } from '@/components/jovie/components/SlashCommandMenu';
import { APP_ROUTES, buildLibraryWorkRoute } from '@/constants/routes';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { CmdKPalette } from './CmdKPalette';

// Six full provider-shaped artist results exercise the real mappers and rows.
// Representative fixture, not a capture of the original dogfood response.
const sixArtists: SpotifyArtistResult[] = [
  {
    id: '4tZwfgrHOc3mvqYlEYSvVi',
    name: 'Daft Punk',
    url: 'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi',
    popularity: 85,
  },
  {
    id: '1gR0gsQYfi6joyO1dlp76N',
    name: 'Justice',
    url: 'https://open.spotify.com/artist/1gR0gsQYfi6joyO1dlp76N',
    popularity: 70,
  },
  {
    id: '7CajNmpbOovFoOoasH2HaY',
    name: 'Calvin Harris',
    url: 'https://open.spotify.com/artist/7CajNmpbOovFoOoasH2HaY',
    popularity: 90,
  },
  {
    id: '2o5jDhtHVPhrJdv3cEQ99Z',
    name: 'Tiësto',
    url: 'https://open.spotify.com/artist/2o5jDhtHVPhrJdv3cEQ99Z',
    popularity: 88,
  },
  {
    id: '1vCWHaC5f2uS3yhpwWbIA6',
    name: 'Avicii',
    url: 'https://open.spotify.com/artist/1vCWHaC5f2uS3yhpwWbIA6',
    popularity: 86,
  },
  {
    id: '2CIMQHirSU0MQqyYHq0eOx',
    name: 'deadmau5',
    url: 'https://open.spotify.com/artist/2CIMQHirSU0MQqyYHq0eOx',
    popularity: 72,
  },
];

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  prefetch: vi.fn(),
  releases: [] as ReleaseLikeRow[],
  loading: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, prefetch: mocks.prefetch }),
}));
vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => <span data-alt={alt} />,
}));
vi.mock('@/lib/queries/useReleasesQuery', () => ({
  useReleasesQuery: () => ({ data: mocks.releases, isLoading: mocks.loading }),
}));
vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => {
    const [query, setQuery] = useState('');
    const clear = useCallback(() => setQuery(''), []);
    return {
      results: sixArtists,
      state: 'success',
      error: null,
      query,
      isPending: false,
      search: setQuery,
      searchImmediate: setQuery,
      clear,
    };
  },
}));
vi.mock('@/lib/queries/useEventsQuery', () => ({
  useEventsQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/lib/queries/useOwnGraphArtistsQuery', () => ({
  useOwnGraphArtistsQuery: () => ({ data: [] }),
}));
vi.mock('@/lib/queries/useChatCapabilitiesQuery', () => ({
  useChatCapabilitiesQuery: () => ({ data: undefined }),
}));

function MainPlane({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const [header, setHeader] = useState<ReactNode>(null);
  return (
    <>
      <header>{header}</header>
      <CmdKPalette
        profileId='profile-1'
        open
        presentation='main'
        onOpenChange={onOpenChange}
        onHeaderChange={setHeader}
      />
    </>
  );
}

function search(query: string) {
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: query } });
  return input;
}

function seedReleases() {
  mocks.releases = Array.from({ length: 6 }, (_, index) => ({
    id: `release-${index + 1}`,
    title: `Palette release ${index + 1}`,
    artistNames: ['Palette fixture'],
    releaseDate: `2026-10-0${6 - index}`,
    releaseType: 'single',
    status: 'released',
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.releases = [];
  mocks.loading = false;
});

describe('Cmd-K destination eligibility', () => {
  it.each(['main', 'dialog'] as const)(
    'opens Contacts exactly once on Enter in %s presentation with six artist hits',
    async presentation => {
      const onOpenChange = vi.fn();
      render(
        presentation === 'main' ? (
          <MainPlane onOpenChange={onOpenChange} />
        ) : (
          <CmdKPalette profileId='profile-1' open onOpenChange={onOpenChange} />
        )
      );
      const user = userEvent.setup();
      const input = screen.getByRole('combobox');
      await user.type(input, 'Contacts');
      expect(input).toHaveValue('Contacts');
      expect(screen.getAllByRole('option')[0]).toHaveTextContent('Contacts');
      expect(mocks.prefetch).toHaveBeenCalledWith(APP_ROUTES.CONTACTS);
      for (const artist of sixArtists) {
        expect(
          screen.queryByRole('option', { name: new RegExp(artist.name) })
        ).toBeNull();
      }
      await user.keyboard('{Enter}');
      expect(mocks.push).toHaveBeenCalledExactlyOnceWith(APP_ROUTES.CONTACTS);
      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    }
  );

  it('shows an empty result instead of six inert artists and cannot commit them', () => {
    const onOpenChange = vi.fn();
    render(<MainPlane onOpenChange={onOpenChange} />);
    const input = search('Daft Punk');
    // The empty-state hint is a disabled placeholder option; no selectable rows.
    expect(
      screen
        .queryAllByRole('option')
        .filter(row => row.getAttribute('aria-disabled') !== 'true')
    ).toHaveLength(0);
    expect(screen.getByText('No matches.')).toBeVisible();
    expect(input).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.push).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('navigates the fifth routable result once with six artists in the source', () => {
    seedReleases();
    const onOpenChange = vi.fn();
    render(<MainPlane onOpenChange={onOpenChange} />);
    const input = search('Palette fixture');
    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(6);
    for (let index = 0; index < 4; index++) {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    }
    expect(rows[4]).toHaveTextContent('Palette release 5');
    expect(rows[4]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveFocus();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith(
      buildLibraryWorkRoute('release-5')
    );
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])(
    'preserves numbered selection and Escape with %o',
    modifier => {
      seedReleases();
      const onOpenChange = vi.fn();
      render(<MainPlane onOpenChange={onOpenChange} />);
      const input = search('Palette fixture');
      const rows = screen.getAllByRole('option');
      for (const number of [3, 1, 2]) {
        expect(rows[number - 1]).toHaveTextContent(`⌘${number}`);
        fireEvent.keyDown(input, { key: String(number), ...modifier });
        expect(rows[number - 1]).toHaveAttribute('aria-selected', 'true');
        expect(input).toHaveFocus();
        expect(mocks.push).not.toHaveBeenCalled();
      }
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
      expect(mocks.push).not.toHaveBeenCalled();
    }
  );

  it('keeps the main pane and list mounted across loading, empty and populated results', () => {
    mocks.loading = true;
    const onOpenChange = vi.fn();
    const { rerender } = render(<MainPlane onOpenChange={onOpenChange} />);
    const pane = screen.getByTestId('cmdk-main-plane');
    const list = screen.getByRole('listbox');
    const status = screen.getByRole('status');
    const input = search('Palette fixture');
    expect(status).toHaveTextContent('Searching');
    expect(list).toHaveAttribute('aria-busy', 'true');
    mocks.loading = false;
    rerender(<MainPlane onOpenChange={onOpenChange} />);
    expect(screen.getByText('No matches.')).toBeVisible();
    seedReleases();
    rerender(<MainPlane onOpenChange={onOpenChange} />);
    expect(screen.getAllByRole('option')).toHaveLength(6);
    expect(screen.getByTestId('cmdk-main-plane')).toBe(pane);
    expect(screen.getByRole('listbox')).toBe(list);
    expect(screen.getByRole('status')).toBe(status);
    expect(screen.getByRole('combobox')).toBe(input);
    expect(input).toHaveValue('Palette fixture');
    expect(input).toHaveFocus();
  });

  it('keeps all six artists selectable as chat slash entity references', () => {
    const onSelectEntity = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SlashCommandMenu
          state={{
            status: 'entity',
            kind: 'artist',
            query: '',
            startIdx: 0,
            selectedIndex: 4,
          }}
          profileId='profile-1'
          onSelectSkill={vi.fn()}
          onSelectEntity={onSelectEntity}
          onSetSelected={vi.fn()}
          onMoveSelected={vi.fn()}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
    const rows = screen.getAllByRole('option');
    expect(rows).toHaveLength(6);
    sixArtists.forEach((artist, index) =>
      expect(rows[index]).toHaveTextContent(artist.name)
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectEntity).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        kind: 'artist',
        id: sixArtists[4].id,
        label: sixArtists[4].name,
      })
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
