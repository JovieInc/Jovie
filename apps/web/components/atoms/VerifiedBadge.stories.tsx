import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { VerifiedBadge } from './VerifiedBadge';

const meta = {
  title: 'Atoms/VerifiedBadge',
  component: VerifiedBadge,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof VerifiedBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Small: Story = {
  args: {
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    size: 'lg',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-center gap-3'>
      <VerifiedBadge size='sm' />
      <VerifiedBadge size='md' />
      <VerifiedBadge size='lg' />
    </div>
  ),
};
