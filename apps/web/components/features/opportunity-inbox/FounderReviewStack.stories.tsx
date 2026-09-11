import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { FounderReviewStack } from './FounderReviewStack';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Founder Review Stack',
  component: FounderReviewStack,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FounderReviewStack>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseCard = {
  id: 'opportunity-1',
  sourceKind: 'test.suggestion',
  signalType: 'other' as const,
  typeLabel: 'Suggestion',
  createdAt: '2026-09-01T18:00:00.000Z',
  title: 'Detroit listeners up 340% — book a show',
  why: 'Promoter email matched your Detroit growth spike.',
  primaryActionLabel: 'Approve',
  status: 'pending' as const,
  category: 'suggestion' as const,
};

const stackCard = {
  ...baseCard,
  visual: {
    url: 'https://picsum.photos/seed/founder-review-stack/1280/640',
    alt: 'Opportunity source visual',
    fit: 'contain' as const,
  },
} as OpportunityInboxCardViewModel & { readonly sourceKind: string };

export const Default: Story = {
  args: {
    cards: [stackCard],
    onApprove: () => {},
    onReject: () => {},
    onOpen: () => {},
    pendingActionId: null,
    keyboardControlRef: { current: null },
  },
};

export const PendingApproval: Story = {
  args: {
    cards: [stackCard],
    onApprove: () => {},
    onReject: () => {},
    pendingActionId: 'opportunity-1',
    keyboardControlRef: { current: null },
  },
};

export const NoVisual: Story = {
  args: {
    cards: [
      {
        ...baseCard,
      } as OpportunityInboxCardViewModel & { readonly sourceKind: string },
    ],
    onApprove: () => {},
    onReject: () => {},
    keyboardControlRef: { current: null },
  },
};

export const YoutubeThumbnailCandidate: Story = {
  args: {
    cards: [
      {
        ...baseCard,
        id: 'yt-opportunity-1',
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
      } as OpportunityInboxCardViewModel & { readonly sourceKind: string },
    ],
    onApprove: () => {},
    onReject: () => {},
    keyboardControlRef: { current: null },
  },
};
