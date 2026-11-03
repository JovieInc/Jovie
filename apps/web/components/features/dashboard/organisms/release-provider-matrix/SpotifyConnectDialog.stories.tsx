import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useEffect } from 'react';
import { expect, userEvent, within } from 'storybook/test';
import { SpotifyConnectDialog } from './SpotifyConnectDialog';

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

const respondWithResults: SearchResponder = () => Response.json(SEARCH_RESULTS);
const respondEmpty: SearchResponder = () => Response.json([]);
const respondUnavailable: SearchResponder = () =>
  Response.json({ error: 'Spotify search is unavailable' }, { status: 404 });
const respondForeverPending: SearchResponder = () =>
  new Promise<Response>(() => {});

function SpotifyConnectDialogStory({
  respond = respondWithResults,
  ...args
}: ComponentProps<typeof SpotifyConnectDialog> & {
  respond?: SearchResponder;
}) {
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
    <div className='min-h-144'>
      <SpotifyConnectDialog {...args} />
    </div>
  );
}

async function typeQuery(canvasElement: HTMLElement, query: string) {
  const canvas = within(canvasElement.ownerDocument.body);
  const input = canvas.getByRole('combobox', {
    name: 'Search Spotify artists or paste a link',
  });
  await userEvent.type(input, query);
  return { canvas, input };
}

const renderWithResponse = (respond: SearchResponder) =>
  function Story(args: ComponentProps<typeof SpotifyConnectDialog>) {
    return <SpotifyConnectDialogStory {...args} respond={respond} />;
  };

const meta = {
  title: 'Features/Dashboard/Releases/SpotifyConnectDialog',
  component: SpotifyConnectDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    connected: false,
    onOpenChange: () => undefined,
  },
  render: args => <SpotifyConnectDialogStory {...args} />,
} satisfies Meta<typeof SpotifyConnectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  render: renderWithResponse(respondForeverPending),
  play: async ({ canvasElement }) => {
    const { canvas } = await typeQuery(canvasElement, 'tim white');
    expect(await canvas.findByRole('status', { busy: true })).toBeVisible();
  },
};

export const Empty: Story = {
  render: renderWithResponse(respondEmpty),
  play: async ({ canvasElement }) => {
    const { canvas } = await typeQuery(canvasElement, 'zzz');
    expect(await canvas.findByText(/No artists match/)).toBeVisible();
  },
};

export const Error: Story = {
  render: renderWithResponse(respondUnavailable),
  play: async ({ canvasElement }) => {
    const { canvas } = await typeQuery(canvasElement, 'tim white');
    expect(await canvas.findByRole('alert')).toHaveTextContent(
      /Spotify search is unavailable/
    );
  },
};

export const Connected: Story = {
  args: {
    connected: true,
    connectedArtistName: 'Tim White',
  },
};

export const Rtl: Story = {
  args: {
    connected: true,
    connectedArtistName:
      'Timothy White the Third and His Very Long Sibling Ensemble Collective',
  },
  render: args => (
    <div dir='rtl' className='min-h-144'>
      <SpotifyConnectDialogStory {...args} respond={respondEmpty} />
    </div>
  ),
};
