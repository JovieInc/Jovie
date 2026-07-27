'use client';

import { TooltipProvider } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { fn } from 'storybook/test';
import { ChatInput } from './ChatInput';

const storyQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    mutations: { retry: false },
  },
});

const meta: Meta<typeof ChatInput> = {
  title: 'Jovie/ChatInput',
  component: ChatInput,
  tags: ['autodocs'],
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <QueryClientProvider client={storyQueryClient}>
        <TooltipProvider>
          <div className='w-[min(45rem,calc(100vw-2rem))]'>
            <Story />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    ),
  ],
  args: {
    value: '',
    onChange: fn(),
    onSubmit: fn(),
    isLoading: false,
    isSubmitting: false,
    placeholder: 'Ask Jovie',
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Start: Story = {
  args: {
    variant: 'start',
  },
};

export const StartWithDraft: Story = {
  args: {
    value: 'Plan my next release',
    variant: 'start',
  },
};

export const Active: Story = {
  args: {
    value: 'Plan my next release',
    variant: 'default',
  },
};

function SharedLifecycleStory() {
  const [value, setValue] = useState('');
  const [isActive, setIsActive] = useState(false);

  return (
    <ChatInput
      value={value}
      onChange={setValue}
      onSubmit={event => {
        event?.preventDefault();
        if (!value.trim()) return;
        setIsActive(true);
        setValue('');
      }}
      isLoading={false}
      isSubmitting={false}
      placeholder='Ask Jovie'
      variant={isActive ? 'default' : 'start'}
    />
  );
}

export const SharedLifecycle: Story = {
  render: () => <SharedLifecycleStory />,
};
