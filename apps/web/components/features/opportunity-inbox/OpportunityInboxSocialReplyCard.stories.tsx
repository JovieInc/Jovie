import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OpportunityInboxSocialReplyCard } from './OpportunityInboxSocialReplyCard';

const socialReply = {
  platform: 'Instagram',
  authorLabel: '@maya.wav',
  typeLabel: 'Collab Request',
  inboundText: 'Loved the new track — would you be down to collab on a remix?',
  draftedText:
    'Thank you so much! I love what you did on "Ghostline" — dropping you a DM about collab windows this month.',
  sourceUrl: 'https://instagram.com/p/abc123',
  executionState: 'pending' as const,
  revisionCount: 0,
};

const card: OpportunityInboxCardViewModel = {
  id: 'reply-1',
  sourceKind: 'social_reply.draft',
  signalType: 'fan_reply',
  typeLabel: 'Fan Reply',
  createdAt: '2026-09-30T10:00:00.000Z',
  title: 'Reply to Maya on Instagram',
  why: 'Inbound collab request drafted from your saved tone profile. Nothing sends until you approve.',
  primaryActionLabel: 'Approve Reply',
  status: 'pending',
  category: 'social_reply',
  socialReply,
};

const meta = {
  title: 'Features/Opportunity Inbox/Social Reply Review',
  component: OpportunityInboxSocialReplyCard,
  parameters: { layout: 'fullscreen' },
  render: args => <OpportunityInboxSocialReplyCard {...args} />,
  decorators: [
    Story => (
      <div className='mx-auto min-h-176 w-full max-w-3xl bg-surface-page p-6'>
        <Story />
      </div>
    ),
  ],
  args: {
    card,
    onApprove: fn(),
    onDismiss: fn(),
    onRevise: fn(),
  },
} satisfies Meta<typeof OpportunityInboxSocialReplyCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {};

export const Revised: Story = {
  args: {
    card: {
      ...card,
      socialReply: {
        ...socialReply,
        executionState: 'checking',
        revisionCount: 1,
        draftedText:
          'That means a lot — your "Ghostline" remix was incredible. Sending you a DM with open dates.',
      },
    },
  },
};

export const NeedsReview: Story = {
  args: {
    card: {
      ...card,
      socialReply: { ...socialReply, executionState: 'ambiguous' },
    },
  },
};

export const Approving: Story = {
  args: { isApproving: true },
};

export const YouTubeComment: Story = {
  args: {
    card: {
      ...card,
      id: 'reply-yt-1',
      title: 'Reply to Jordan on YouTube',
      socialReply: {
        ...socialReply,
        platform: 'YouTube',
        authorLabel: '@jordan.beats',
        typeLabel: 'Fan Comment',
        inboundText: 'This drop goes crazy — the bridge at 2:14 is unreal.',
        draftedText:
          'Appreciate you Jordan — that bridge took forever to get right. More coming soon.',
        sourceUrl: 'https://youtube.com/watch?v=abc123',
        videoTitle: 'Midnight Run (Official Video)',
        likeCount: 42,
      },
    },
  },
};
