import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { GrowthIntakeComposer } from './GrowthIntakeComposer';

const meta = {
  title: 'Features/Admin/Leads/GrowthIntakeComposer',
  component: GrowthIntakeComposer,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-105'>
        <Story />
      </div>
    ),
  ],
  args: {
    initialMode: 'single',
  },
} satisfies Meta<typeof GrowthIntakeComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Single: Story = {};

export const Batch: Story = {
  args: {
    initialMode: 'batch',
  },
};

export const Queue: Story = {
  args: {
    initialMode: 'queue',
  },
};
