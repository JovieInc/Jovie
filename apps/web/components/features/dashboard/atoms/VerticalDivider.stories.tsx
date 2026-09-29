import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VerticalDivider } from './VerticalDivider';

const meta = {
  title: 'Dashboard/Atoms/VerticalDivider',
  component: VerticalDivider,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VerticalDivider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const BetweenActions: Story = {
  render: () => (
    <div className='flex items-center gap-2 rounded-full border border-subtle bg-surface-1 px-2 py-1'>
      <span className='text-xs text-secondary-token'>Filter</span>
      <VerticalDivider />
      <span className='text-xs text-secondary-token'>Sort</span>
    </div>
  ),
};
