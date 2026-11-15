import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { IngestProfileDropdown } from './IngestProfileDropdown';

/**
 * Rendered states of the ingest popover's Spotify search. Each story stubs
 * the artist search request and restores fetch afterwards. Each one searches
 * a different name so no story reads another story's cached results.
 */
const meta = {
  title: 'Features/Admin/IngestProfileDropdown/States',
  component: IngestProfileDropdown,
  parameters: { layout: 'centered' },
  args: { onIngestPending: fn(), hideLabelOnMobile: false },
} satisfies Meta<typeof IngestProfileDropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

function stubSearch(respond: () => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = () => respond();
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}

async function searchSpotify(canvasElement: HTMLElement, query: string) {
  const canvas = within(canvasElement);
  await userEvent.click(canvas.getByRole('button', { name: 'Ingest Profile' }));
  const page = within(canvasElement.ownerDocument.body);
  await userEvent.click(await page.findByRole('tab', { name: 'Spotify' }));
  await userEvent.type(page.getByPlaceholderText(/Spotify/i), query);
  return page;
}

function artist(index: number, name: string) {
  return {
    id: `artist-${index}`,
    name,
    url: `https://open.spotify.com/artist/${String(index).padStart(22, '0')}`,
    popularity: 60,
  };
}

/** Loading: the Spotify search is in flight. */
export const LoadingSpotifySearch: Story = {
  beforeEach: stubSearch(() => new Promise<Response>(() => undefined)),
  play: async ({ canvasElement }) => {
    const page = await searchSpotify(canvasElement, 'loading artist');
    await expect(
      await page.findByText('Searching Spotify...')
    ).toBeInTheDocument();
  },
};

/** Empty: Spotify found no artist for the name. */
export const EmptySpotifySearch: Story = {
  beforeEach: stubSearch(async () => Response.json([])),
  play: async ({ canvasElement }) => {
    const page = await searchSpotify(canvasElement, 'no such artist');
    await expect(
      await page.findByText('No artists found. Try a different search.')
    ).toBeInTheDocument();
  },
};

/** Error: Spotify rate-limits the search and the reason shows. */
export const ErrorSpotifySearch: Story = {
  beforeEach: stubSearch(async () =>
    Response.json({ error: 'Rate limited' }, { status: 429 })
  ),
  play: async ({ canvasElement }) => {
    const page = await searchSpotify(canvasElement, 'rate limited artist');
    await expect(
      await page.findByText('Too many requests. Please wait a moment.')
    ).toBeInTheDocument();
  },
};

/** Offline: the search cannot reach the server; after retries it fails. */
export const OfflineSpotifySearch: Story = {
  beforeEach: stubSearch(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  ),
  play: async ({ canvasElement }) => {
    const page = await searchSpotify(canvasElement, 'offline artist');
    // The fetch layer normalizes network failures to FetchNetworkError
    // ('Network request failed'); the dropdown renders that message
    // verbatim (useIngestProfile renders `spotifyError` directly), so the
    // matcher asserts the actual offline copy, not the raw TypeError text.
    await expect(
      await page.findByText(
        /Network request failed|Spotify search failed/i,
        undefined,
        {
          timeout: 8000,
        }
      )
    ).toBeInTheDocument();
  },
};

/** Long content: many results with long artist names in the capped list. */
export const LongContentSpotifyResults: Story = {
  beforeEach: stubSearch(async () =>
    Response.json(
      Array.from({ length: 6 }, (_, index) =>
        artist(
          index + 1,
          `The Extraordinarily Long-Named Midnight Orchestra and Friends ${index + 1}`
        )
      )
    )
  ),
  play: async ({ canvasElement }) => {
    const page = await searchSpotify(canvasElement, 'midnight orchestra');
    await expect(
      await page.findByText(
        'The Extraordinarily Long-Named Midnight Orchestra and Friends 1'
      )
    ).toBeInTheDocument();
  },
};

const withRtl: Decorator = function WithRtl(Story) {
  return (
    <div dir='rtl' lang='ar'>
      <Story />
    </div>
  );
};

/** RTL: Arabic artist results inside a right-to-left admin page. */
export const RtlSpotifyResults: Story = {
  decorators: [withRtl],
  beforeEach: stubSearch(async () =>
    Response.json([artist(1, 'فيروز'), artist(2, 'عمرو دياب')])
  ),
  play: async ({ canvasElement }) => {
    const page = await searchSpotify(canvasElement, 'fairuz');
    await expect(await page.findByText('فيروز')).toBeInTheDocument();
  },
};
