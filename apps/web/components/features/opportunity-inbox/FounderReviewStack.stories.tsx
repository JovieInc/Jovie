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
