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
