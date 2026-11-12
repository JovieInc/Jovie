import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import type { SpotifyArtistResult } from '@/lib/queries';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

type ApiMock = (request: {
  url: URL;
  init?: RequestInit;
}) => Response | Promise<Response> | undefined;
type ApiMockWindow = Window & { __jovieApiMock?: ApiMock };

const SEARCH_PATH = '/api/spotify/search';

/**
 * Stories never reach Spotify. The search answers through the preview's
 * `/api/*` mock seam for its own path only; every other request falls through
 * to the previous handler, which is restored after the story.
 */
function mockSpotifySearch(respond: () => Promise<Response>) {
  return () => {
    const mockWindow = window as ApiMockWindow;
    const previous = mockWindow.__jovieApiMock;
    mockWindow.__jovieApiMock = request =>
      request.url.pathname === SEARCH_PATH ? respond() : previous?.(request);
    return () => {
      mockWindow.__jovieApiMock = previous;
    };
  };
}

const answer = (results: SpotifyArtistResult[]) =>
  mockSpotifySearch(async () => Response.json(results));

async function search(canvasElement: HTMLElement, query: string) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole('combobox'), query);
  return canvas;
}

const RESULTS: SpotifyArtistResult[] = [
  {
    id: 'story-neon-harbor',
    name: 'Neon Harbor',
    url: 'https://open.spotify.com/artist/story-neon-harbor',
    popularity: 40,
    followers: 18_400,
    verified: true,
  },
  {
    id: 'story-neon-harbour',
    name: 'Neon Harbour',
    url: 'https://open.spotify.com/artist/story-neon-harbour',
    popularity: 10,
    followers: 900,
  },
];

function SpotifySearchQueryProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const meta = {
  title: 'Features/Waitlist/WaitlistSpotifySearch',
  component: WaitlistSpotifySearch,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    Story => (
      <SpotifySearchQueryProvider>
        <div className='mx-auto max-w-md px-4 py-10'>
          <Story />
        </div>
      </SpotifySearchQueryProvider>
    ),
  ],
} satisfies Meta<typeof WaitlistSpotifySearch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SearchMode: Story = {
  args: {
    spotifyUrl: '',
    onUrlChange: () => {},
    onArtistNameChange: () => {},
    fieldErrors: {},
    isSubmitting: false,
    isHydrating: false,
    setInputRef: () => {},
  },
};

export const UrlMode: Story = {
  args: {
    spotifyUrl: 'https://open.spotify.com/artist/story-artist',
    onUrlChange: () => {},
    onArtistNameChange: () => {},
    fieldErrors: {},
    isSubmitting: false,
    isHydrating: false,
    setInputRef: () => {},
  },
};

const SEARCH_ARGS = SearchMode.args;
const RETRY_WINDOW_MS = 8_000;

/** The search is in flight and never answers. */
export const LoadingSearch: Story = {
  args: SEARCH_ARGS,
  beforeEach: mockSpotifySearch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    await expect(await canvas.findByLabelText('Searching')).toBeVisible();
  },
};

/** Two matches and the way to paste a link instead. */
export const Results: Story = {
  args: SEARCH_ARGS,
  beforeEach: answer(RESULTS),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    // The visible rows mirror the hidden listbox, so they are read by text.
    await expect(await canvas.findByText('Neon Harbour')).toBeVisible();
  },
};

/** Spotify knows no artist by that name. */
export const EmptyResults: Story = {
  args: SEARCH_ARGS,
  beforeEach: answer([]),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Zzyzx');
    await expect(await canvas.findByText('No artists found')).toBeVisible();
  },
};

/** The search service answers with a failure. */
export const ErrorSearch: Story = {
  args: SEARCH_ARGS,
  beforeEach: mockSpotifySearch(async () =>
    Response.json({ error: 'Search failed' }, { status: 502 })
  ),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    // The query retries a failed request twice before it reports the error.
    await expect(
      await canvas.findByText('Search failed. Try again.', undefined, {
        timeout: RETRY_WINDOW_MS,
      })
    ).toBeVisible();
  },
};

/** The connection drops mid-search; the manual link path stays available. */
export const OfflineSearch: Story = {
  args: SEARCH_ARGS,
  beforeEach: mockSpotifySearch(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    // The query retries a failed request twice before it reports the error.
    await expect(
      await canvas.findByText('Search failed. Try again.', undefined, {
        timeout: RETRY_WINDOW_MS,
      })
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: /Manually add URL/ })
    ).toBeVisible();
  },
};

/** Long artist names and follower counts truncate inside the result rows. */
export const LongContentResults: Story = {
  args: SEARCH_ARGS,
  beforeEach: answer([
    {
      id: 'story-long',
      name: 'The Extraordinarily Long Name Of A Touring Collective That Keeps Going',
      url: 'https://open.spotify.com/artist/story-long',
      popularity: 60,
      followers: 12_400_000,
      verified: true,
    },
  ]),
  play: async ({ canvasElement }) => {
    const canvas = await search(
      canvasElement,
      'The Extraordinarily Long Name Of A Touring Collective'
    );
    await expect(await canvas.findByText('12.4M followers')).toBeVisible();
  },
};

/** The search and its results in a right-to-left locale. */
export const RtlResults: Story = {
  args: SEARCH_ARGS,
  beforeEach: answer([
    {
      id: 'story-rtl',
      name: 'فرقة الميناء المضيء',
      url: 'https://open.spotify.com/artist/story-rtl',
      popularity: 30,
      followers: 4_200,
    },
  ]),
  decorators: [
    Story => (
      <div dir='rtl'>
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'فرقة');
    await expect(await canvas.findByText('فرقة الميناء المضيء')).toBeVisible();
  },
};
