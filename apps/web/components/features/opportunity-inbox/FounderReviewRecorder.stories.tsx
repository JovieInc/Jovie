import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { FounderReviewRecorder } from './FounderReviewRecorder';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Founder Review Recorder',
  component: FounderReviewRecorder,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof FounderReviewRecorder>;

export default meta;
type Story = StoryObj<typeof meta>;

const inboxTarget = {
  type: 'inbox-card' as const,
  id: 'card-1',
  title: 'Refresh a weak YouTube thumbnail',
  sourceKind: 'youtube.thumbnail_candidate',
  category: 'suggestion',
};

const noteTarget = {
  type: 'founder-note' as const,
  id: 'brain-dump-1',
  title: 'Brain Dump',
  sourceKind: 'founder.brain_dump',
  category: 'suggestion',
};

export const InboxCard: Story = {
  args: {
    target: inboxTarget,
    onApprove: () => {},
    onReject: () => {},
  },
};

export const FounderNote: Story = {
  args: {
    target: noteTarget,
  },
};
