import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { artistProvider } from './artist-provider';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

/** Answers the Spotify artist search the way a story asks; returns a restore. */
function stubArtistSearch(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname === '/api/spotify/search'
      ? respond()
      : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

function artist(
  id: string,
  name: string,
  extra: Partial<SpotifyArtistResult> = {}
): SpotifyArtistResult {
  return {
    id,
    name,
    url: `https://open.spotify.com/artist/${id}`,
    popularity: 50,
    followers: 12000,
    ...extra,
  };
}

function respondWith(results: readonly SpotifyArtistResult[]) {
  return () => Promise.resolve(Response.json(results));
}

function ArtistProviderDemo({ query }: { readonly query: string }) {
  const { items, isLoading } = artistProvider.useSearch(query);

  return (
    <div className='w-72 space-y-2' aria-busy={isLoading}>
      {isLoading ? (
        <p className='text-sm text-secondary-token'>Searching artists…</p>
      ) : null}
      {!isLoading && items.length === 0 ? (
        <p className='text-sm text-secondary-token'>No artists found</p>
      ) : null}
      {items.map(item => (
        <div key={item.id}>{artistProvider.renderChip(item)}</div>
      ))}
    </div>
  );
}

function StoryQueryProvider({ children }: { readonly children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const meta = {
  title: 'Jovie/ArtistProvider',
  component: ArtistProviderDemo,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <StoryQueryProvider>
        <div className='bg-base p-3'>
          <Story />
        </div>
      </StoryQueryProvider>
    ),
  ],
  args: {
    query: 'nova',
  },
} satisfies Meta<typeof ArtistProviderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const MatchingArtists: Story = {
  beforeEach: () =>
    stubArtistSearch(
      respondWith([
        artist('nova-1', 'Nova Lane', { isClaimed: true, verified: true }),
        artist('nova-2', 'Nova Sound Collective'),
      ])
    ),
};

/** The search request is still in flight. */
export const LoadingSearch: Story = {
  beforeEach: () => stubArtistSearch(() => new Promise<Response>(() => {})),
};

/** Spotify has no artist for the query. */
export const EmptyNoMatches: Story = {
  args: { query: 'zzqx' },
  beforeEach: () => stubArtistSearch(respondWith([])),
};

/** Long artist names truncate inside the chip instead of widening the menu. */
export const LongContentArtistNames: Story = {
  beforeEach: () =>
    stubArtistSearch(
      respondWith([
        artist(
          'nova-long-1',
          'Nova and the Extraordinarily Long Named Midnight Orchestra of Everywhere'
        ),
        artist(
          'nova-long-2',
          'Nova Featuring Every Collaborator Who Ever Appeared On The Deluxe Edition'
        ),
      ])
    ),
};

/** The network is down: the provider returns no artists and stops loading. */
export const OfflineSearch: Story = {
  beforeEach: () =>
    stubArtistSearch(() => Promise.reject(new TypeError('Failed to fetch'))),
};

/** Arabic artist names in a right-to-left menu. */
export const RtlArtistNames: Story = {
  args: { query: 'نور' },
  beforeEach: () =>
    stubArtistSearch(
      respondWith([
        artist('noor-1', 'نور الهدى'),
        artist('noor-2', 'فرقة نور الليل'),
      ])
    ),
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
