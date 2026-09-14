import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { type ComponentProps, useEffect } from 'react';
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
function SpotifyConnectDialogStory(
  args: ComponentProps<typeof SpotifyConnectDialog>
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
        return new Response(JSON.stringify(SEARCH_RESULTS), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return previousFetch(input, init);
    };

    return () => {
      window.fetch = previousFetch;
    };
  }, []);

  return (
    <div className='min-h-[36rem]'>
      <SpotifyConnectDialog {...args} />
    </div>
  );
}
const meta = {
  title: 'Features/Dashboard/Releases/SpotifyConnectDialog',
  component: SpotifyConnectDialog,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['onConnected', 'onImportStart'],
    },
  },
  args: {
    open: true,
    onOpenChange: () => undefined,
  },
  render: args => <SpotifyConnectDialogStory {...args} />,
} satisfies Meta<typeof SpotifyConnectDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
