import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { WaitlistSpotifySearch } from './WaitlistSpotifySearch';

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
