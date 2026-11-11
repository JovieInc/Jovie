import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { SpotifyArtistResult } from '@/lib/contracts/api';
import { ClaimArtistSearch } from './ClaimArtistSearch';

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
  await userEvent.type(
    canvas.getByRole('searchbox', { name: 'Find your artist on Spotify' }),
    query
  );
  return canvas;
}

const RESULTS: SpotifyArtistResult[] = [
  {
    id: 'story-open',
    name: 'Neon Harbor',
    url: '',
    popularity: 40,
    followers: 18_400,
  },
  {
    id: 'story-owned',
    name: 'Neon Harbor Live',
    url: '',
    popularity: 20,
    isClaimed: true,
    isClaimedByCurrentUser: true,
  },
  {
    id: 'story-taken',
    name: 'Neon Harbour',
    url: '',
    popularity: 10,
    followers: 900,
    isClaimed: true,
  },
];

const meta = {
  title: 'Claim/ClaimArtistSearch',
  component: ClaimArtistSearch,
  parameters: {
    layout: 'padded',
    nextjs: { appDirectory: true, navigation: { pathname: '/claim' } },
  },
  decorators: [
    Story => (
      <div className='w-full max-w-md'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ClaimArtistSearch>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Nothing typed yet: the search field and the create-profile way out. */
export const Idle: Story = {};

/** A claimable artist, the viewer's own profile and one claimed by someone else. */
export const Results: Story = {
  beforeEach: answer(RESULTS),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    await expect(
      await canvas.findByTestId('claim-artist-option')
    ).toHaveTextContent('Claim');
    await expect(canvas.getByTestId('claim-artist-owned')).toHaveTextContent(
      'Open'
    );
    await expect(canvas.getByTestId('claim-artist-claimed')).toHaveTextContent(
      'Claimed'
    );
  },
};

/** The search is in flight and never answers. */
export const LoadingSearch: Story = {
  beforeEach: mockSpotifySearch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    await expect(await canvas.findByText('Searching…')).toBeVisible();
  },
};

/** Spotify knows no artist by that name. */
export const EmptyResults: Story = {
  beforeEach: answer([]),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Qxzv');
    await expect(
      await canvas.findByText(
        'No artists found. You can create your profile below.'
      )
    ).toBeVisible();
  },
};

/** The search route answered with a server error. */
export const ErrorSearchUnavailable: Story = {
  beforeEach: mockSpotifySearch(async () =>
    Response.json({ error: 'Spotify unavailable' }, { status: 503 })
  ),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    await expect(
      await canvas.findByText(
        'Search is unavailable. Try again, or create your profile below.'
      )
    ).toBeVisible();
  },
};

/** The connection dropped before the search reached the server. */
export const OfflineSearch: Story = {
  beforeEach: mockSpotifySearch(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Neon');
    await expect(
      await canvas.findByText(
        'Search is unavailable. Try again, or create your profile below.'
      )
    ).toBeVisible();
  },
};

/** Long artist names truncate inside their row; follower counts stay compact. */
export const LongContent: Story = {
  beforeEach: answer([
    {
      id: 'story-long',
      name: 'The Extraordinarily Long Named Collective Of Late Night Synth Players',
      url: '',
      popularity: 60,
      followers: 2_400_000,
    },
    {
      id: 'story-long-taken',
      name: 'The Extraordinarily Long Named Collective Of Late Night Synth Players (Live)',
      url: '',
      popularity: 30,
      isClaimed: true,
    },
  ]),
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Extraordinarily');
    await expect(
      await canvas.findByTestId('claim-artist-option')
    ).toHaveTextContent('2.4M followers');
  },
};

/** The search inside a right-to-left page with Arabic results. */
export const Rtl: Story = {
  beforeEach: answer([
    {
      id: 'story-rtl',
      name: 'فرقة الأوركسترا الإلكترونية من الدار البيضاء',
      url: '',
      popularity: 50,
      followers: 52_000,
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
    await expect(
      await canvas.findByTestId('claim-artist-option')
    ).toBeVisible();
  },
};
