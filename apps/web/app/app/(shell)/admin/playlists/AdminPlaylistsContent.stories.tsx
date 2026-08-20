import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { AdminPlaylistsContent } from './AdminPlaylistsContent';

const meta = {
  title: 'Admin/Playlists/Review Workspace',
  component: AdminPlaylistsContent,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='min-h-96 p-4'>
        <Story />
      </div>
    ),
  ],
  args: {
    currentTab: 'pending',
    playlists: [],
    approveAction: fn(),
    rejectAction: fn(),
  },
} satisfies Meta<typeof AdminPlaylistsContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EmptyPending: Story = {};

export const PendingReview: Story = {
  args: {
    playlists: [
      {
        id: 'playlist-1',
        title: 'Midnight Focus',
        slug: 'midnight-focus',
        status: 'pending',
        trackCount: 24,
        genreTags: ['ambient', 'electronic'],
        createdAt: new Date('2026-08-18T06:00:00.000Z'),
        publishedAt: null,
        spotifyPlaylistId: null,
      },
    ],
  },
};

export const Narrow: Story = {
  ...PendingReview,
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
