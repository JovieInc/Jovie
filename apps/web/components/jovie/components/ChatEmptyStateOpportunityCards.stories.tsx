import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import type { OpportunityInboxCardViewModel } from '@/lib/connectors/opportunity-inbox-types';
import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';

const cards: readonly OpportunityInboxCardViewModel[] = [
  {
    id: 'release-checklist',
    signalType: 'other',
    typeLabel: 'Suggestion',
    title: 'Review your release checklist',
    why: 'Check artwork, credits and links before the release.',
    createdAt: '2026-01-15T12:00:00.000Z',
    primaryActionLabel: 'Review',
    status: 'pending',
    category: 'suggestion',
  },
];

const meta = {
  title: 'Chat/EmptyState/OpportunityCards',
  component: ChatEmptyStateOpportunityCards,
  args: {
    cards,
    onSelect: fn(),
  },
} satisfies Meta<typeof ChatEmptyStateOpportunityCards>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Compact: Story = {};
