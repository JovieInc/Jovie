import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { YouTubeChannelPilotPanel } from './YouTubeChannelPilotPanel';

const meta = {
  title: 'Features/YouTube/ChannelPilotPanel',
  component: YouTubeChannelPilotPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='flex min-h-192 min-w-0 bg-surface-page'>
        <Story />
      </div>
    ),
  ],
  args: {
    workspace: {
      state: 'connected',
      authorizedChannelId: 'UC90tJdD38139ytPUdEZVl1A',
      scopes: [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
      ],
      lastSyncAt: '2026-09-01T12:00:00.000Z',
      errorMessage: null,
      videos: [
        {
          id: 'video-pk-1',
          channelId: 'UC90tJdD38139ytPUdEZVl1A',
          videoId: 'video-1',
          title: 'The Last Time (Official Video)',
          url: 'https://youtube.com/watch?v=video-1',
          publishedAt: '2026-08-20T12:00:00.000Z',
          privacyStatus: 'public',
          thumbnailUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg',
          lastSyncedAt: '2026-09-01T12:00:00.000Z',
          apiMetrics: {
            window: 'lifetime',
            capturedAt: '2026-09-01T12:00:00.000Z',
            views: 128_450,
            watchTimeMinutes: 438_900,
            avgViewDurationSeconds: 205,
            impressions: null,
            ctr: null,
          },
        },
        {
          id: 'video-pk-2',
          channelId: 'UC90tJdD38139ytPUdEZVl1A',
          videoId: 'video-2',
          title: 'A Quiet Revival — Live',
          url: 'https://youtube.com/watch?v=video-2',
          publishedAt: '2026-07-12T12:00:00.000Z',
          privacyStatus: 'unlisted',
          thumbnailUrl: null,
          lastSyncedAt: '2026-09-01T12:00:00.000Z',
          apiMetrics: null,
        },
      ],
    },
  },
} satisfies Meta<typeof YouTubeChannelPilotPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {};

export const AuthorizationRequired: Story = {
  args: {
    workspace: {
      state: 'auth-required',
      videos: [],
      errorMessage: null,
    },
  },
};

export const Narrow: Story = {
  decorators: [
    Story => (
      <div className='mx-auto flex min-h-192 w-90 max-w-full bg-surface-page'>
        <Story />
      </div>
    ),
  ],
};
