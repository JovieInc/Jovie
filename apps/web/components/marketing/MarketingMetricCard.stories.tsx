import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CalendarDays, Radio } from 'lucide-react';
import { MarketingMetricCard } from './MarketingMetricCard';

const meta = {
  title: 'Marketing/Primitives/MarketingMetricCard',
  component: MarketingMetricCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    Story => (
      <div className='bg-base px-6 py-16 text-primary-token'>
        <div className='mx-auto max-w-sm'>
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof MarketingMetricCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    icon: (
      <CalendarDays className='h-4 w-4' aria-hidden='true' strokeWidth={1.9} />
    ),
    label: 'Next drop',
    value: 'Friday',
  },
};

export const WithAside: Story = {
  args: {
    icon: <Radio className='h-4 w-4' aria-hidden='true' strokeWidth={1.9} />,
    label: 'Momentum',
    value: 'Building',
    valueAside: 'Presave is open',
  },
};

export const WithDescription: Story = {
  args: {
    icon: (
      <CalendarDays className='h-4 w-4' aria-hidden='true' strokeWidth={1.9} />
    ),
    label: 'Fan action',
    value: 'Join in',
    description:
      'Capture intent before release day and keep the next action in one surface.',
  },
};
