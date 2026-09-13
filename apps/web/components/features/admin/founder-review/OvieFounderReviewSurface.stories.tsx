import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { OvieFounderReviewSurface } from './OvieFounderReviewSurface';

const meta = {
  title: 'Admin/Ovie/Founder Review Surface',
  component: OvieFounderReviewSurface,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof OvieFounderReviewSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

const card = {
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
} satisfies OpportunityInboxCardViewModel;

export const Default: Story = {
  args: {
    cards: [card],
  },
};

export const EmptyQueue: Story = {
  args: {
    cards: [],
  },
};
