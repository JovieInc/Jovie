import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
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

/** A second search keeps the existing rows and create-profile target steady. */
export const RefreshingResults: Story = {
  parameters: { themes: { themeOverride: 'dark' } },
  beforeEach: () => {
    let requests = 0;
    return mockSpotifySearch(() =>
      ++requests === 1
        ? Promise.resolve(Response.json(RESULTS))
        : new Promise<Response>(() => undefined)
    )();
  },
  play: async ({ canvasElement }) => {
    const canvas = await search(canvasElement, 'Steady');
    const list = await canvas.findByTestId('claim-artist-results');
    const textBefore = list.textContent;
    const linksBefore = Array.from(list.querySelectorAll('a'), link =>
      link.getAttribute('href')
    );
    const create = canvas.getByTestId('claim-create-profile');
    const input = canvas.getByRole('searchbox', {
      name: 'Find your artist on Spotify',
    });
    const before = list.getBoundingClientRect();
    const createBefore = create.getBoundingClientRect();
    await expect(before.height).toBeGreaterThan(0);

    await userEvent.type(input, ' artist');
    await waitFor(() =>
      expect(list.parentElement).toHaveAttribute('aria-busy', 'true')
    );
    await expect(canvas.queryByText('Searching…')).toBeNull();
    await expect(canvas.getByTestId('claim-artist-results')).toBe(list);
    await expect(list.textContent).toBe(textBefore);
    await expect(
      Array.from(list.querySelectorAll('a'), link => link.getAttribute('href'))
    ).toEqual(linksBefore);
    await expect(list).toHaveClass('opacity-90');
    await expect(list.getBoundingClientRect().y).toBe(before.y);
    await expect(list.getBoundingClientRect().height).toBe(before.height);
    await expect(create.getBoundingClientRect().y).toBe(createBefore.y);
    await expect(canvasElement.ownerDocument.activeElement).toBe(input);
  },
};

/** The same pending-state geometry and contrast contract in compact light mode. */
export const RefreshingResultsLight: Story = {
  ...RefreshingResults,
  parameters: { themes: { themeOverride: 'light' } },
  decorators: [
    Story => (
      <div className='w-80'>
        <Story />
      </div>
    ),
  ],
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
        'Search is unavailable. Try again, or create your profile below.',
        {},
        { timeout: 10_000 }
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
        'Search is unavailable. Try again, or create your profile below.',
        {},
        { timeout: 10_000 }
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
