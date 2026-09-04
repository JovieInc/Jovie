import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AvatarUploadOverlay } from './AvatarUploadOverlay';

const meta = {
  title: 'Atoms/AvatarUploadOverlay',
  component: AvatarUploadOverlay,
  parameters: {
    layout: 'centered',
  },
  args: {
    iconSize: 24,
  },
  render: args => (
    <div className='group/avatar relative h-24 w-24 overflow-hidden rounded-full bg-surface-2'>
      <AvatarUploadOverlay {...args} />
    </div>
  ),
} satisfies Meta<typeof AvatarUploadOverlay>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Hover: Story = {};

export const DragOver: Story = {
  args: {
    isDragOver: true,
  },
};

export const Artwork: Story = {
  args: {
    isDragOver: true,
    shapeClassName: 'rounded-lg',
  },
  render: args => (
    <div className='relative h-24 w-24 overflow-hidden rounded-lg bg-surface-2'>
      <AvatarUploadOverlay {...args} />
    </div>
  ),
};
