import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from '../chat-empty-starters';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';
import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';
import { ChatInput } from './ChatInput';

function StoryComposerDock() {
  return (
    <label className='system-b-chat-content-shell block rounded-2xl bg-surface-1 px-3 py-2 text-sm text-secondary-token'>
      Message
      <textarea
        className='mt-1 w-full resize-none bg-transparent text-primary-token'
        rows={2}
        placeholder='Ask anything'
        aria-label='Message'
      />
    </label>
  );
}

const meta = {
  title: 'Chat/EmptyState/ComposerRegion',
  component: ChatEmptyStateComposerRegion,
  parameters: { layout: 'fullscreen' },
  args: {
    children: <StoryComposerDock />,
    onSelectSample: fn(),
  },
  decorators: [
    Story => {
      try {
        sessionStorage.removeItem(CHAT_EMPTY_SAMPLE_STORAGE_KEY);
      } catch {
        // Story extraction can run without Web Storage.
      }
      return (
        <div className='flex min-h-96 justify-center bg-base p-6'>
          <div className='w-full max-w-xl'>
            <Story />
          </div>
        </div>
      );
    },
  ],
} satisfies Meta<typeof ChatEmptyStateComposerRegion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const JustAskCentered: Story = {};

export const JustAskDocked: Story = {
  args: {
    stableDocked: true,
    showDockedWelcome: true,
    children: <StoryComposerDock />,
    onSelectSample: fn(),
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
