import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { UserAvatar } from './avatar';

// Deterministic inline SVG portrait — no network fetch, so Chromatic stays stable.
const AVATAR_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' fill='%236366f1'/%3E%3Ccircle cx='48' cy='36' r='16' fill='%23e0e7ff'/%3E%3Cellipse cx='48' cy='88' rx='28' ry='22' fill='%23e0e7ff'/%3E%3C/svg%3E";

const meta: Meta<typeof UserAvatar> = {
  title: 'UI/Atoms/Avatar',
  component: UserAvatar,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'Circular user avatar with image, initials fallback, optional status dot, ring separator, and a size scale from xs (16px) to display-4xl (384px).',
      },
    },
  },
  tags: ['autodocs'],
  argTypes: {
    src: {
      control: { type: 'text' },
      description: 'Image URL — if omitted or fails, initials are shown',
    },
    name: {
      control: { type: 'text' },
      description: 'Full name used for initials and alt text',
    },
    size: {
      control: { type: 'select' },
      options: [
        'xs',
        'sm',
        'md',
        'lg',
        'xl',
        '2xl',
        'display-sm',
        'display-md',
        'display-lg',
        'display-xl',
        'display-2xl',
        'display-3xl',
        'display-4xl',
      ],
      description: 'Avatar size',
    },
    status: {
      control: { type: 'select' },
      options: ['online', 'away', 'offline'],
      description: 'Optional status dot',
    },
    ring: {
      control: { type: 'boolean' },
      description: 'Show ring separator (useful for stacked groups)',
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: 'Taylor Reed',
  },
};

export const WithImage: Story = {
  args: {
    name: 'Taylor Reed',
    src: AVATAR_IMAGE,
    size: 'xl',
  },
};

export const Statuses: Story = {
  render: () => (
    <div className='flex items-center gap-4'>
      <UserAvatar
        name='Taylor Reed'
        src={AVATAR_IMAGE}
        size='xl'
        status='online'
      />
      <UserAvatar
        name='Jordan Miles'
        src={AVATAR_IMAGE}
        size='xl'
        status='away'
      />
      <UserAvatar
        name='Casey Rivers'
        src={AVATAR_IMAGE}
        size='xl'
        status='offline'
      />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Status dots: online (success), away (warning), offline (muted).',
      },
    },
  },
};

export const Sizes: Story = {
  render: () => (
    <div className='flex items-end gap-3'>
      <UserAvatar name='Taylor Reed' size='xs' />
      <UserAvatar name='Taylor Reed' size='sm' />
      <UserAvatar name='Taylor Reed' size='md' />
      <UserAvatar name='Taylor Reed' size='lg' />
      <UserAvatar name='Taylor Reed' size='xl' />
      <UserAvatar name='Taylor Reed' size='2xl' />
      <UserAvatar name='Taylor Reed' size='display-sm' />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'Initials fallback across the size scale — fallback typography scales with the avatar.',
      },
    },
  },
};
