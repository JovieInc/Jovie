import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ContentChartState } from './ContentChartState';

const meta = {
  title: 'Molecules/ContentChartState',
  component: ContentChartState,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-full max-w-2xl text-primary-token'>
        <Story />
      </div>
    ),
  ],
  args: {
    state: 'empty',
    title: 'No usage data',
    message: 'No usage data available yet.',
    heightClassName: 'h-64',
  },
} satisfies Meta<typeof ContentChartState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
