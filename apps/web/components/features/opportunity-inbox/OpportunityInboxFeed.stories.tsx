import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxFeed } from './OpportunityInboxFeed';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Feed',
  component: OpportunityInboxFeed,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OpportunityInboxFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseCard: OpportunityInboxCardViewModel = {
  id: 'feed-card-1',
  sourceKind: 'test.suggestion',
  signalType: 'other',
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Approve',
  status: 'pending',
  category: 'suggestion',
};

export const Default: Story = {
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    pendingActionId: null,
    pendingFeedbackId: null,
    pendingNextStepId: null,
    enableStackInteractions: false,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};

export const StackInteractions: Story = {
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    enableStackInteractions: true,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};

export const YoutubeThumbnailCandidate: Story = {
  args: {
    cards: [
      {
        ...baseCard,
        id: 'yt-feed-1',
        sourceKind: 'youtube.thumbnail_candidate',
        typeLabel: 'YouTube Thumbnail',
        title: 'Review thumbnail for The Last Time',
        why: 'YouTube API snapshot captured Sep 1, 2026. Approval records intent; publication stays blocked pending a native Studio experiment and provider readback.',
        primaryActionLabel: 'Approve Candidate',
        category: 'youtube_thumbnail',
        youtubeThumbnail: {
          channelId: 'UC90tJdD38139ytPUdEZVl1A',
          youtubeVideoId: 'video-1',
          currentThumbnailUrl:
            'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg',
          candidateImageUrl:
            'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
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
      },
    ],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    enableStackInteractions: false,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};

export const Loading: Story = {
  args: {
    cards: [baseCard],
    onApprove: () => {},
    onDismiss: () => {},
    onFeedback: (id: string, rating: 'positive' | 'negative') => {
      void id;
      void rating;
    },
    pendingActionId: 'feed-card-1',
    enableStackInteractions: true,
  },
  render: args => (
    <div className='bg-(--app-shell-content-surface) p-6'>
      <OpportunityInboxFeed {...args} />
    </div>
  ),
};
