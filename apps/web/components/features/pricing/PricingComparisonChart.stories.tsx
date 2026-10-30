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
