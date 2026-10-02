import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PlaceholderImage } from './PlaceholderImage';

const meta = {
  title: 'Atoms/PlaceholderImage',
  component: PlaceholderImage,
  parameters: {
    layout: 'centered',
  },
} satisfies Meta<typeof PlaceholderImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Square: Story = {
  args: {
    shape: 'square',
  },
};

export const Rounded: Story = {
  args: {
    shape: 'rounded',
  },
};

export const Large: Story = {
  args: {
    size: 'xl',
  },
};

export const AllSizes: Story = {
  render: () => (
    <div className='flex items-end gap-3'>
      <PlaceholderImage size='sm' />
      <PlaceholderImage size='md' />
      <PlaceholderImage size='lg' />
      <PlaceholderImage size='xl' />
      <PlaceholderImage size='2xl' />
    </div>
  ),
};
