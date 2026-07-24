import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AvatarUploadOverlay } from './AvatarUploadOverlay';

const meta: Meta<typeof AvatarUploadOverlay> = {
  title: 'Atoms/AvatarUploadOverlay',
  component: AvatarUploadOverlay,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          'An overlay component shown on avatars during hover or drag-over states.',
      },
    },
  },
  argTypes: {
    iconSize: {
      control: { type: 'range', min: 16, max: 48, step: 4 },
      description: 'Size of the upload icon',
    },
    isDragOver: {
      control: 'boolean',
      description: 'Whether the user is dragging a file over the avatar',
    },
  },
  decorators: [
    Story => (
      <div className='relative h-24 w-24 rounded-full bg-surface-2'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof AvatarUploadOverlay>;

export const HoverState: Story = {
  args: {
    iconSize: 24,
    isDragOver: false,
  },
  decorators: [
    Story => (
      <div className='group relative h-24 w-24 rounded-full bg-surface-2'>
        <div className='absolute inset-0 flex items-center justify-center text-secondary-token'>
          Avatar
        </div>
        <Story />
      </div>
    ),
  ],
};

export const DragOverState: Story = {
  args: {
    iconSize: 24,
    isDragOver: true,
  },
};

export const SmallIcon: Story = {
  args: {
    iconSize: 16,
    isDragOver: false,
  },
  decorators: [
    Story => (
      <div className='group relative h-16 w-16 rounded-full bg-surface-2'>
        <Story />
      </div>
    ),
  ],
};

export const LargeIcon: Story = {
  args: {
    iconSize: 32,
    isDragOver: false,
  },
  decorators: [
    Story => (
      <div className='group relative h-32 w-32 rounded-full bg-surface-2'>
        <Story />
      </div>
    ),
  ],
};

export const BothStates: Story = {
  render: () => (
    <div className='flex gap-8'>
      <div className='flex flex-col items-center gap-2'>
        <div className='group relative h-24 w-24 rounded-full bg-surface-2'>
          <div className='absolute inset-0 flex items-center justify-center text-xs text-secondary-token'>
            Hover me
          </div>
          <AvatarUploadOverlay iconSize={24} isDragOver={false} />
        </div>
        <span className='text-xs text-secondary-token'>Hover State</span>
      </div>
      <div className='flex flex-col items-center gap-2'>
        <div className='relative h-24 w-24 rounded-full bg-surface-2'>
          <AvatarUploadOverlay iconSize={24} isDragOver={true} />
        </div>
        <span className='text-xs text-secondary-token'>Drag Over</span>
      </div>
    </div>
  ),
};
