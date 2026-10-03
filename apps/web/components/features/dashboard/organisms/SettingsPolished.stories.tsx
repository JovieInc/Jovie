import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { withDashboardProviders } from '@/.storybook/dashboard-fixtures';
import { SettingsPolished } from './SettingsPolished';

const meta = {
  title: 'Features/Dashboard/Organisms/SettingsPolished',
  component: SettingsPolished,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['artist'],
    },
  },
  decorators: [withDashboardProviders],
} satisfies Meta<typeof SettingsPolished>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    artist: {
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
    },
  },
};
