import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlatformConnectionsClient } from './PlatformConnectionsClient';

const meta = {
  title: 'Admin/Platform Connections/Workspace',
  component: PlatformConnectionsClient,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    currentTab: 'spotify',
    spotifyStatus: {
      connected: true,
      healthy: true,
      source: 'database',
      clerkUserId: 'user_1',
      accountLabel: 'Jovie Publisher',
      approvedScopes: [],
      missingScopes: [],
      updatedAt: '2026-08-18T12:00:00.000Z',
      error: null,
    },
    engineSettings: {
      enabled: true,
      intervalValue: 3,
      intervalUnit: 'days',
      lastGeneratedAt: '2026-08-18T06:00:00.000Z',
      nextEligibleAt: '2026-08-21T06:00:00.000Z',
    },
    currentUser: {
      hasSpotify: true,
      label: 'Jovie Publisher',
      missingScopes: [],
    },
  },
} satisfies Meta<typeof PlatformConnectionsClient>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SpotifyPublisher: Story = {};

export const PlaylistEngine: Story = {
  args: { currentTab: 'engine' },
};

export const NeedsConfiguration: Story = {
  args: {
    spotifyStatus: {
      connected: false,
      healthy: false,
      source: 'missing',
      clerkUserId: null,
      accountLabel: null,
      approvedScopes: [],
      missingScopes: ['playlist-modify-public'],
      updatedAt: null,
      error: 'Playlist Spotify publisher is not configured.',
    },
    currentUser: {
      hasSpotify: false,
      label: null,
      missingScopes: ['playlist-modify-public'],
    },
  },
};

export const Narrow: Story = {
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
