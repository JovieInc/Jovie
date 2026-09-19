import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useEffect, useState } from 'react';
import { fn } from 'storybook/test';
import {
  CHAT_COMPOSER_ATTACH_ARIA_LABEL,
  CHAT_COMPOSER_INPUT_ARIA_LABEL,
} from '../chat-composer-copy';
import { CHAT_EMPTY_SAMPLE_STORAGE_KEY } from '../chat-empty-starters';
import { ChatEmptyStateComposerRegion } from './ChatEmptyStateComposerRegion';
import { ChatEmptyStateOpportunityCards } from './ChatEmptyStateOpportunityCards';

function StoryComposerDock({
  value = '',
  onChange,
  pickerOpen = false,
  onPickerOpenChange,
}: {
  readonly value?: string;
  readonly onChange?: (next: string) => void;
  readonly pickerOpen?: boolean;
  readonly onPickerOpenChange?: (open: boolean) => void;
}) {
  return (
    <div
      className='system-b-chat-content-shell rounded-2xl bg-surface-1 px-3 py-2'
      data-testid='chat-composer-surface'
    >
      <div className='flex items-end gap-2'>
        <button
          type='button'
          aria-label={CHAT_COMPOSER_ATTACH_ARIA_LABEL}
          aria-expanded={pickerOpen}
          className='shrink-0 rounded-md px-2 py-1 text-sm'
          onClick={() => onPickerOpenChange?.(!pickerOpen)}
        >
          +
        </button>
        <textarea
          className='min-h-9 w-full resize-none bg-transparent text-sm text-primary-token'
          rows={2}
          placeholder='Ask anything'
          aria-label={CHAT_COMPOSER_INPUT_ARIA_LABEL}
          value={value}
          onChange={event => onChange?.(event.target.value)}
        />
      </div>
      {pickerOpen ? (
        <div role='menu' className='mt-2'>
          <button type='button' role='menuitem'>
            Upload file
          </button>
        </div>
      ) : null}
    </div>
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
  const [pickerOpen, setPickerOpen] = useState(false);
  useEffect(() => {
    if (!pickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pickerOpen]);
  return (
    <div className='h-screen'>
      <ChatEmptyStateComposerRegion
        stableDocked
        above={
          pickerOpen ? undefined : (
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
          )
        }
      >
        <StoryComposerDock
          value={value}
          onChange={setValue}
          pickerOpen={pickerOpen}
          onPickerOpenChange={setPickerOpen}
        />
      </ChatEmptyStateComposerRegion>
    </div>
  );
}

export const AboveComposer: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <DockedSuggestions />,
};
