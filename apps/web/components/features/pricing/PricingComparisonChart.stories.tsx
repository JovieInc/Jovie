import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PricingComparisonChart } from './PricingComparisonChart';

const meta = {
  title: 'Pricing/PricingComparisonChart',
  component: PricingComparisonChart,
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof PricingComparisonChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Comparison: Story = {
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <PricingComparisonChart />
      </div>
    </div>
  ),
};

/** The page in a right-to-left locale: the plan picker and both tables mirror. */
export const Rtl: Story = {
  render: () => (
    <div dir='rtl' className='min-h-dvh bg-page px-4 py-10 md:px-8'>
      <div className='mx-auto max-w-6xl'>
        <PricingComparisonChart />
      </div>
    </div>
  ),
};

/**
 * The mobile comparison in a 320px column: the longest registry feature
 * labels wrap inside their row instead of widening the table.
 */
export const LongContentNarrow: Story = {
  render: () => (
    <div className='min-h-dvh bg-page px-4 py-10'>
      <div className='mx-auto w-80'>
        <PricingComparisonChart />
      </div>
    </div>
  ),
};
