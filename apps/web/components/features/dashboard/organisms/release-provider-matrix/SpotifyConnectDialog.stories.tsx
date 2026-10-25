import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SpotifyConnectDialog } from './SpotifyConnectDialog';

const LONG_NAME =
  'Timothy White the Third and His Very Long Sibling Ensemble Collective';

const SEARCH_RESULTS = [
  {
    id: 'spotify-tim-white',
    name: 'Tim White',
    url: 'https://open.spotify.com/artist/spotify-tim-white',
    followers: 9900,
    popularity: 60,
    isClaimed: true,
    isClaimedByCurrentUser: true,
  },
  {
    id: 'spotify-watt-white',
    name: 'Watt White',
    url: 'https://open.spotify.com/artist/spotify-watt-white',
    followers: 47300,
    popularity: 58,
  },
  {
    id: 'spotify-lex-white',
    name: 'Lex White',
    url: 'https://open.spotify.com/artist/spotify-lex-white',
    followers: 3600,
    popularity: 45,
  },
  {
    id: 'spotify-other-owner',
    name: 'Other Owner',
    url: 'https://open.spotify.com/artist/spotify-other-owner',
    followers: 2100,
    popularity: 32,
    isClaimed: true,
  },
  {
    id: 'spotify-last-result',
    name: 'Last Result',
    url: 'https://open.spotify.com/artist/spotify-last-result',
    followers: 800,
    popularity: 25,
  },
] as const;

type SearchResponder = (query: string) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const respondWithResults: SearchResponder = () =>
  jsonResponse([...SEARCH_RESULTS]);
const respondEmpty: SearchResponder = () => jsonResponse([]);
const respondUnavailable: SearchResponder = () =>
  jsonResponse({ error: 'Spotify search is unavailable' }, 404);
const respondForeverPending: SearchResponder = () =>
  new Promise<Response>(() => {});

function SpotifyConnectDialogStory(
  args: ComponentProps<typeof SpotifyConnectDialog>,
  respond: SearchResponder = respondWithResults,
  wrapperClassName = 'min-h-144'
) {
  useEffect(() => {
    const previousFetch = window.fetch;
    window.fetch = async (input, init) => {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const url = new URL(rawUrl, window.location.href);
      if (url.pathname === '/api/spotify/search') {
        return respond(url.searchParams.get('q') ?? '');
      }
      return previousFetch(input, init);
    };

    return () => {
      window.fetch = previousFetch;
    };
  }, [respond]);

  return (
    <div className={wrapperClassName}>
      <SpotifyConnectDialog {...args} />
    </div>
  );
}

async function typeQuery(canvasElement: HTMLElement, query: string) {
  const canvas = within(canvasElement);
  const input = canvas.getByRole('combobox', {
    name: 'Search Spotify artists or paste a link',
  });
  await userEvent.type(input, query);
  return { canvas, input };
}

const meta = {
  title: 'Features/Dashboard/Releases/SpotifyConnectDialog',
  component: SpotifyConnectDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onOpenChange: () => undefined,
  },
} satisfies Meta<typeof SpotifyConnectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: args => <SpotifyConnectDialogStory {...args} />,
};

export const Empty: Story = {
  render: args => <SpotifyConnectDialogStory {...args} respondEmpty />,
};

export const Loading: Story = {
  render: args => (
    <SpotifyConnectDialogStory {...args} respond={respondForeverPending} />
  ),
  play: async ({ canvasElement }) => {
    await typeQuery(canvasElement, 'tim white');
    await waitFor(
      () =>
        expect(
          within(canvasElement).getByRole('status', {
            name: 'Loading',
          })
        ).toBeTruthy(),
      { timeout: 5000 }
    );
  },
};

export const NoMatch: Story = {
  render: args => (
    <SpotifyConnectDialogStory {...args} respond={respondEmpty} />
  ),
  play: async ({ canvasElement }) => {
    await typeQuery(canvasElement, 'zzz');
    await waitFor(
      () =>
        expect(
          within(canvasElement).getByText(/No artists match/)
        ).toBeTruthy(),
      { timeout: 5000 }
    );
  },
};

export const Error: Story = {
  render: args => (
    <SpotifyConnectDialogStory {...args} respond={respondUnavailable} />
  ),
  play: async ({ canvasElement }) => {
    await typeQuery(canvasElement, 'tim white');
    await waitFor(
      () =>
        expect(within(canvasElement).getByRole('alert')).toHaveTextContent(
          /Spotify search is unavailable/
        ),
      { timeout: 5000 }
    );
  },
};

export const Connected: Story = {
  args: {
    connected: true,
    connectedArtistName: 'Tim White',
  },
  render: args => <SpotifyConnectDialogStory {...args} />,
};

export const Rtl: Story = {
  args: {
    connected: true,
    connectedArtistName: LONG_NAME,
  },
  render: args => (
    <div dir='rtl' className='min-h-144'>
      <SpotifyConnectDialogStory {...args} respond={respondEmpty} />
    </div>
  ),
};
