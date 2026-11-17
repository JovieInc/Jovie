import type { Decorator, Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ProviderKey, ReleaseViewModel } from '@/lib/discography/types';
import type { ProviderConfig } from './ReleaseTable.types';
import { ReleaseTableWithTracks } from './ReleaseTableWithTracks';

type ApiMockWindow = Window & {
  __jovieApiMock?: (request: {
    url: URL;
    init?: RequestInit;
  }) => Response | Promise<Response> | undefined;
};

const LONG_TITLE =
  'Seaside Heights (Tenth Anniversary Remastered Deluxe Edition with Bonus Live Sessions, Demos and Commentary)';
const LONG_ARTIST =
  'Tim White and the Extraordinarily Long Collaborative Orchestra of the Northern Coastline';

const providerConfig = {
  spotify: { label: 'Spotify', accent: '#1DB954' },
  apple_music: { label: 'Apple Music', accent: '#FA243C' },
} as Record<ProviderKey, ProviderConfig>;

function createRelease(
  id: string,
  overrides: Record<string, unknown> = {}
): ReleaseViewModel {
  return {
    profileId: 'profile_1',
    id,
    title: 'Seaside Heights',
    artistNames: ['Tim White'],
    releaseDate: '2026-08-01',
    status: 'released',
    slug: id,
    smartLinkPath: `/${id}`,
    providers: [],
    releaseType: 'album',
    isExplicit: false,
    totalTracks: 3,
    ...overrides,
  } as unknown as ReleaseViewModel;
}

const releases = [
  createRelease('seaside-heights'),
  createRelease('low-tide', {
    title: 'Low Tide',
    releaseType: 'single',
    totalTracks: 1,
  }),
];

/** Answers the track request the way a story asks; returns a restore. */
function stubTrackRequest(respond: () => Promise<Response>) {
  const apiMockWindow = window as ApiMockWindow;
  const previous = apiMockWindow.__jovieApiMock;
  apiMockWindow.__jovieApiMock = request =>
    request.url.pathname.endsWith('/tracks') ? respond() : previous?.(request);
  return () => {
    apiMockWindow.__jovieApiMock = previous;
  };
}

function holdTrackRequest() {
  return stubTrackRequest(() => new Promise<Response>(() => {}));
}

function dropTrackRequest() {
  return stubTrackRequest(() =>
    Promise.reject(new TypeError('Failed to fetch'))
  );
}

const withRtl: Decorator = Story => (
  <div dir='rtl'>
    <Story />
  </div>
);

const withNarrowColumn: Decorator = Story => (
  <div className='w-full max-w-md'>
    <Story />
  </div>
);

// Year grouping turns row virtualization off, so every row is in the DOM
// whatever height the story canvas has.
const meta = {
  title: 'Dashboard/Releases/ReleaseTableWithTracks States',
  component: ReleaseTableWithTracks,
  parameters: { layout: 'fullscreen' },
  args: {
    releases,
    providerConfig,
    artistName: 'Tim White',
    onCopy: fn(async () => 'copied'),
    onEdit: fn(),
    groupByYear: true,
  },
} satisfies Meta<typeof ReleaseTableWithTracks>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the track request is still in flight, so the expander is busy. */
export const LoadingTracks: Story = {
  beforeEach: holdTrackRequest,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Expand tracks' })
    );
    await expect(
      await canvas.findByRole('button', { name: 'Expand tracks' })
    ).toBeDisabled();
    await expect(
      canvas.queryByTestId('release-track-stack-seaside-heights')
    ).toBeNull();
  },
};

/** Long content: long release and artist names in a narrow column. */
export const LongContentTitles: Story = {
  args: {
    releases: [
      createRelease('seaside-heights', { title: LONG_TITLE }),
      createRelease('low-tide', { title: `${LONG_TITLE} (Instrumental)` }),
    ],
    artistName: LONG_ARTIST,
  },
  decorators: [withNarrowColumn],
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await canvas.findByTestId('release-row');
    await expect(row).toHaveTextContent(LONG_TITLE);
    await userEvent.click(within(row).getByText(LONG_TITLE));
    await expect(args.onEdit).toHaveBeenCalledTimes(1);
  },
};

/** Offline: the track request never reaches the server, so no tracks are listed. */
export const OfflineTracksUnavailable: Story = {
  beforeEach: dropTrackRequest,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Expand tracks' })
    );
    await expect(
      await canvas.findByText('No tracks found for this release')
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Collapse tracks' })
    ).toBeEnabled();
  },
};

/** Right-to-left: the release rows inside an RTL document. */
export const RtlReleases: Story = {
  decorators: [withRtl],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByTestId('release-row')).toHaveTextContent(
      'Seaside Heights'
    );
    await expect(canvas.getByText('Low Tide')).toBeVisible();
  },
};
