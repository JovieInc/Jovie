import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Avatar, AvatarFallback, AvatarImage, AvatarStatusDot, UserAvatar } from './avatar';

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
      <AvatarImage src='https://cdn.jov.ie/static/placeholder-avatar.png' alt='Artist' />
      <AvatarFallback>AR</AvatarFallback>
      <AvatarStatusDot status='online' />
    </Avatar>
  ),
};

export const User: Story = {
  render: () => <UserAvatar name='Tim White' size='xl' status='away' />,
};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-end gap-2'>
      {(['sm', 'md', 'lg', 'xl'] as const).map(size => (
        <Avatar key={size} size={size}>
          <AvatarFallback>{size}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  ),
};
