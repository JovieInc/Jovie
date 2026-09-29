import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { Artist } from '@/types/db';
import { AlertGrowthLanding } from './AlertGrowthLanding';

const artist: Artist = {
  id: 'mock-artist-id',
  owner_user_id: 'mock-user-id',
  handle: 'artisthandle',
  spotify_id: 'mock-spotify-id',
  name: 'Mock Artist',
  image_url: 'https://example.com/avatar.jpg',
  tagline: 'Mock artist tagline',
  published: true,
  is_verified: true,
  is_featured: false,
  marketing_opt_out: false,
  created_at: '2023-01-01T00:00:00Z',
};

const meta = {
  title: 'Features/Alerts/AlertGrowthLanding',
  component: AlertGrowthLanding,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['artist', 'disabled'],
    },
  },
} satisfies Meta<typeof AlertGrowthLanding>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    artist,
  },
};
