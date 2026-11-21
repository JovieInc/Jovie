import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { YouTubeChannelPilotPanel } from './YouTubeChannelPilotPanel';

const CHANNEL_ID = 'UC90tJdD38139ytPUdEZVl1A';

function framed(Story: () => React.ReactElement, dir?: 'rtl') {
  return (
    <div dir={dir} className='flex min-h-192 min-w-0 bg-surface-page'>
      <Story />
    </div>
  );
}

const meta = {
  title: 'Features/YouTube/ChannelPilotPanel/States',
  component: YouTubeChannelPilotPanel,
  parameters: { layout: 'fullscreen' },
  decorators: [Story => framed(Story)],
} satisfies Meta<typeof YouTubeChannelPilotPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const connected = {
  state: 'connected',
  authorizedChannelId: CHANNEL_ID,
  scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  lastSyncAt: null,
  errorMessage: null,
} as const;

const video = {
  id: 'video-pk-1',
  channelId: CHANNEL_ID,
  videoId: 'video-1',
  url: 'https://youtube.com/watch?v=video-1',
  publishedAt: '2026-08-20T12:00:00.000Z',
  privacyStatus: 'public',
  thumbnailUrl: null,
  lastSyncedAt: '2026-09-01T12:00:00.000Z',
  apiMetrics: null,
} as const;

/** Loading: the channel is authorized and the first API sync has not landed. */
export const LoadingFirstSync: Story = {
  args: { workspace: { ...connected, videos: [] } },
};

/** Empty: no videos are represented yet for an authorized channel. */
export const EmptyNoVideos: Story = {
  args: {
    workspace: {
      ...connected,
      lastSyncAt: '2026-09-01T12:00:00.000Z',
      videos: [],
    },
  },
};

/** Error: more than one connected channel, so no ledger is shown. */
export const ErrorAmbiguousChannel: Story = {
  args: {
    workspace: {
      state: 'ambiguous-channel',
      videos: [],
      errorMessage: 'More than one connected channel.',
    },
  },
};

/** Long content: a video title far past the two-line clamp. */
export const LongContentVideoTitle: Story = {
  args: {
    workspace: {
      ...connected,
      lastSyncAt: '2026-09-01T12:00:00.000Z',
      videos: [
        {
          ...video,
          title:
            'The Last Time (Official Video) featuring a very long list of collaborators, a director, an editor and a second unit crew, recorded live across three cities in one week',
        },
      ],
    },
  },
};

/** Rtl: an Arabic video title inside a right-to-left container. */
export const RtlVideoTitle: Story = {
  args: {
    workspace: {
      ...connected,
      lastSyncAt: '2026-09-01T12:00:00.000Z',
      videos: [{ ...video, title: 'المرة الأخيرة (فيديو رسمي)' }],
    },
  },
  decorators: [Story => framed(Story, 'rtl')],
};
