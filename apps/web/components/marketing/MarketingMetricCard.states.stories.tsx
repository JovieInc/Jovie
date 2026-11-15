import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { CalendarDays } from 'lucide-react';
import { MarketingMetricCard } from './MarketingMetricCard';

const meta = {
  title: 'Marketing/Primitives/MarketingMetricCard States',
  component: MarketingMetricCard,
  parameters: { layout: 'fullscreen' },
  args: {
    icon: (
      <CalendarDays className='h-4 w-4' aria-hidden='true' strokeWidth={1.9} />
    ),
    label: 'Next drop',
    value: 'Friday',
  },
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

/** Partial: label and value only, with no aside and no description. */
export const PartialValueOnly: Story = {};

/** Long content: a long label, value, aside and description. */
export const LongContentMetric: Story = {
  args: {
    label: 'Next drop across every streaming service',
    value: 'Friday, January 15',
    valueAside: 'Presave is open in 42 countries',
    description:
      'Capture intent before release day and keep the next action in one surface, so every fan who presaved hears about it the moment it is live.',
  },
};

/** Right-to-left: Arabic metric copy in an Arabic document direction. */
export const RtlArabic: Story = {
  args: {
    label: 'الإصدار القادم',
    value: 'الجمعة',
    valueAside: 'الحفظ المسبق مفتوح',
  },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
