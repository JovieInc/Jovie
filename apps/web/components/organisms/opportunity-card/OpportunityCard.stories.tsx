import '../../../styles/system-b-app.css';
import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ChatEmptyStateComposerRegion } from '@/components/jovie/components/ChatEmptyStateComposerRegion';
import { ChatEmptyStateOpportunityCards } from '@/components/jovie/components/ChatEmptyStateOpportunityCards';
import { ChatInput } from '@/components/jovie/components/ChatInput';
import { OpportunityCard } from './OpportunityCard';

const meta = {
  title: 'Organisms/OpportunityCard',
  component: OpportunityCard,
  args: {
    format: 'compact',
    title: 'Review your release checklist',
    description: 'Check artwork, credits and links before the release.',
    icon: <Sparkles className='size-3.5' />,
    onSelect: fn(),
  },
} satisfies Meta<typeof OpportunityCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Compact: Story = {};
export const Editorial: Story = {
  args: {
    format: 'editorial',
    metadata: <span>Release review</span>,
    children: (
      <Button size='sm' onClick={fn()}>
        Review Release
      </Button>
    ),
  },
};
function DockedSuggestions() {
  const [value, setValue] = useState('');
  return (
    <div className='h-screen'>
      <ChatEmptyStateComposerRegion
        stableDocked
        above={
          <ChatEmptyStateOpportunityCards
            cards={[
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
            ]}
            onSelect={card => setValue(card.title)}
          />
        }
      >
        <ChatInput
          value={value}
          onChange={setValue}
          onSubmit={fn()}
          onFileAttach={fn()}
          variant='hero'
        />
      </ChatEmptyStateComposerRegion>
    </div>
  );
}
export const AboveComposer: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <DockedSuggestions />,
};
