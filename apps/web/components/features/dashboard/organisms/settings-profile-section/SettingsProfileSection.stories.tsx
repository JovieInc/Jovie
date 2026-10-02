import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Artist } from '@/types/db';
import { SettingsProfileSection } from './SettingsProfileSection';

const artist: Artist = {
  id: 'story-profile',
  owner_user_id: 'story-user',
  handle: 'sashawaves',
  spotify_id: 'spotify-artist-1',
  name: 'Sasha Waves',
  image_url: undefined,
  tagline: 'Independent artist making dream-pop.',
  theme: {},
  settings: {},
  location: 'Los Angeles, CA',
  hometown: 'Nashville, TN',
  career_highlights: '500K+ monthly listeners on Spotify.',
  target_playlists: null,
  published: true,
  is_verified: false,
  is_featured: false,
  marketing_opt_out: false,
  created_at: new Date('2026-01-01T00:00:00.000Z').toISOString(),
} as Artist;

function SettingsProfileQueryProvider({
  children,
}: {
  readonly children: React.ReactNode;
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
  title: 'Dashboard/Organisms/SettingsProfileSection',
  component: SettingsProfileSection,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <SettingsProfileQueryProvider>
        <div className='w-2xl max-w-full'>
          <Story />
        </div>
      </SettingsProfileQueryProvider>
    ),
  ],
  args: {
    artist,
    onArtistUpdate: () => {},
    onRefresh: () => {},
  },
} satisfies Meta<typeof SettingsProfileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LowQualityAvatar: Story = {
  args: {
    avatarQuality: { status: 'low', width: 96, height: 96 },
  },
};

export const NoBioDetails: Story = {
  args: {
    artist: {
      ...artist,
      location: null,
      hometown: null,
      career_highlights: null,
    },
  },
};
