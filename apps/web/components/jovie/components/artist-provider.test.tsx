import { render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import type { ArtistSearchState } from '@/lib/queries/useArtistSearchQuery';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { artistProvider } from './artist-provider';

const searchState: {
  results: SpotifyArtistResult[];
  state: ArtistSearchState;
} = { results: [], state: 'idle' };
const search = vi.fn();

vi.mock('@/lib/queries/useArtistSearchQuery', () => ({
  useArtistSearchQuery: () => ({
    results: searchState.results,
    state: searchState.state,
    error: null,
    search,
    searchImmediate: vi.fn(),
    clear: vi.fn(),
    query: '',
    isPending: false,
  }),
}));

function artist(
  id: string,
  name: string,
  extra: Partial<SpotifyArtistResult> = {}
): SpotifyArtistResult {
  return {
    id,
    name,
    url: `https://open.spotify.com/artist/${id}`,
    popularity: 40,
    ...extra,
  };
}

function ArtistSearchDemo({ initialQuery = '' }: { initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const { items, isLoading } = artistProvider.useSearch(query);
  return (
    <div>
      <label>
        Search artists
        <input value={query} onChange={event => setQuery(event.target.value)} />
      </label>
      <output aria-busy={isLoading}>
        {isLoading ? 'Searching artists' : `${items.length} artists`}
      </output>
      <ul>
        {items.map(item => (
          <li key={item.id}>{artistProvider.renderChip(item)}</li>
        ))}
      </ul>
    </div>
  );
}

describe('artistProvider', () => {
  beforeEach(() => {
    search.mockClear();
    searchState.results = [];
    searchState.state = 'idle';
  });

  it('searches Spotify for every query the user types', async () => {
    const user = userEvent.setup();
    const { container } = render(<ArtistSearchDemo />);

    await user.type(screen.getByLabelText('Search artists'), 'nova');

    expect(search).toHaveBeenLastCalledWith('nova');
    await expectNoA11yViolations(container);
  });

  it('maps results into artist entity refs', () => {
    searchState.results = [
      artist('a1', 'Nova Lane', {
        isClaimed: true,
        verified: true,
        followers: 900,
      }),
      artist('a2', 'Other Artist', { imageUrl: '/art.png' }),
    ];
    searchState.state = 'success';

    const { result } = renderHook(() => artistProvider.useSearch('nova'));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.items).toEqual([
      expect.objectContaining({
        kind: 'artist',
        id: 'a1',
        label: 'Nova Lane',
        meta: expect.objectContaining({
          subtitle: 'You',
          isYou: true,
          verified: true,
          followers: 900,
        }),
      }),
      expect.objectContaining({
        id: 'a2',
        thumbnail: '/art.png',
        meta: expect.objectContaining({ subtitle: 'Spotify artist' }),
      }),
    ]);
  });

  it('reports loading while the search is in flight', async () => {
    searchState.state = 'loading';
    const { container } = render(<ArtistSearchDemo initialQuery='nova' />);
    expect(screen.getByRole('status')).toHaveTextContent('Searching artists');
    await expectNoA11yViolations(container);
  });

  it.each([
    ['empty', 'empty'],
    ['offline', 'error'],
  ] as const)(
    'returns no artists when the search is %s',
    async (_label, state) => {
      searchState.state = state;
      const { container } = render(<ArtistSearchDemo initialQuery='nova' />);
      expect(screen.getByRole('status')).toHaveTextContent('0 artists');
      expect(screen.queryByTestId('entity-chip')).not.toBeInTheDocument();
      await expectNoA11yViolations(container);
    }
  );

  it('renders long and right-to-left artist names as input chips', async () => {
    searchState.results = [
      artist(
        'long',
        'Nova and the Extraordinarily Long Named Midnight Orchestra of Everywhere'
      ),
      artist('rtl', 'نور الهدى'),
    ];
    searchState.state = 'success';
    const { container } = render(
      <div dir='rtl' lang='ar'>
        <ArtistSearchDemo initialQuery='نور' />
      </div>
    );

    const chips = screen.getAllByTestId('entity-chip');
    expect(chips).toHaveLength(2);
    expect(chips[1]).toHaveAttribute('data-entity-label', 'نور الهدى');
    expect(chips[0]).toHaveAttribute('data-entity-chip', 'true');
    await expectNoA11yViolations(container);
  });
});
