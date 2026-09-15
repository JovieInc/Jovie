import { Button } from '@jovie/ui';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Sparkles } from 'lucide-react';
import { fn } from 'storybook/test';
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

export const CompactDisabled: Story = {
  args: {
    disabled: true,
    title: 'Downloading Jovie Update…',
    description:
      'The update will be ready to install when the download completes.',
  },
};
