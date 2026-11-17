import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentMetricCardSkeleton } from './ContentMetricCardSkeleton';

/** Rendered states of the metric card skeleton, beside ContentMetricCardSkeleton.stories.tsx. */
const meta = {
  title: 'Molecules/ContentMetricCardSkeleton States',
  component: ContentMetricCardSkeleton,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-56 bg-surface-1 p-3'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContentMetricCardSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the default card placeholder with icon and subtitle lines. */
export const LoadingDefaultCard: Story = {};

/** Loading: the stacked icon-chip placeholder with a wide subtitle line. */
export const LoadingIconChipWideSubtitle: Story = {
  args: {
    layout: 'icon-chip',
    subtitleWidth: 'w-32',
  },
};
