import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarStatusDot,
  UserAvatar,
} from './avatar';

const meta: Meta<typeof Avatar> = {
  title: 'UI/Atoms/Avatar',
  component: Avatar,
  parameters: { layout: 'centered' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Avatar size='lg'>
      <AvatarFallback>TW</AvatarFallback>
    </Avatar>
  ),
};

export const WithImage: Story = {
  render: () => (
    <Avatar size='lg' ring>
      <AvatarImage
        src='https://cdn.jov.ie/static/placeholder-avatar.png'
        alt='Artist'
      />
      <AvatarStatusDot status='online' size='lg' />
    </Avatar>
  ),
};

export const ArtworkComposition: Story = {
  render: () => (
    <div className='flex items-end gap-6'>
      <div className='grid justify-items-center gap-2'>
        <Avatar size='2xl' shape='artwork'>
          <AvatarImage
            src='https://placehold.co/400x600/111827/E5E7EB?text=Full+Artwork'
            alt='Full release artwork using inherited props'
          />
        </Avatar>
        <span className='text-xs text-tertiary-token'>Inherited</span>
      </div>
      <div className='grid justify-items-center gap-2'>
        <Avatar size='2xl' shape='artwork'>
          <AvatarImage
            src='https://placehold.co/400x600/111827/E5E7EB?text=Full+Artwork'
            alt='Full release artwork using explicit props'
            size='2xl'
            shape='artwork'
          />
        </Avatar>
        <span className='text-xs text-tertiary-token'>Explicit</span>
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Artwork children inherit the parent rounded-square geometry and preserve the full image with contain fit; explicit matching props remain supported.',
      },
    },
  },
};

export const User: Story = {
  render: () => <UserAvatar name='Tim White' size='xl' status='away' />,
};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-end gap-3'>
      {(['xs', 'sm', 'md', 'lg', 'xl', '2xl'] as const).map(size => (
        <Avatar key={size} size={size}>
          <AvatarFallback size={size}>{size}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};

export const PresenceStates: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      {(['online', 'away', 'offline'] as const).map(status => (
        <div key={status} className='grid justify-items-center gap-2'>
          <UserAvatar name={status} size='lg' status={status} />
          <span className='text-xs text-tertiary-token'>{status}</span>
        </div>
      ))}
    </div>
  ),
};
