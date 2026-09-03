import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { OpportunityCardStack } from './OpportunityCardStack';

const card = {
  id: 'candidate-1',
  signalType: 'other' as const,
  typeLabel: 'YouTube Thumbnail',
  createdAt: new Date().toISOString(),
  title: 'Review thumbnail for The Last Time',
  why: 'YouTube API snapshot captured Sep 1, 2026. Approval records intent; publication stays blocked pending a native Studio experiment and provider readback.',
  primaryActionLabel: 'Approve Candidate',
  status: 'pending' as const,
  category: 'youtube_thumbnail' as const,
  youtubeThumbnail: {
    channelId: 'UC90tJdD38139ytPUdEZVl1A',
    youtubeVideoId: 'video-1',
    currentThumbnailUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg',
    candidateImageUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
    artifactSha256:
      'aab81dd7f28d4421478c03e4d0d62a58ef13db556c4c52beacf56f24f782ba01',
    apiMetrics: {
      capturedAt: '2026-09-01T12:00:00.000Z',
      views: 128_450,
      watchTimeMinutes: 438_900,
      avgViewDurationSeconds: 205,
    },
    publicationBlockedReason:
      'direct-thumbnail-mutation-disabled-native-experiment-required',
  },
};

const meta = {
  title: 'Features/Opportunity Inbox/YouTube Thumbnail Review',
  component: OpportunityCardStack,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='mx-auto min-h-176 w-full max-w-3xl bg-surface-page p-6'>
        <Story />
      </div>
    ),
  ],
  args: {
    cards: [card],
    onAccept: fn(),
    onReject: fn(),
    onOpen: fn(),
  },
} satisfies Meta<typeof OpportunityCardStack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {};

export const Narrow: Story = {
  decorators: [
    Story => (
      <div className='mx-auto min-h-176 w-90 max-w-full bg-surface-page p-3'>
        <Story />
      </div>
    ),
  ],
};
