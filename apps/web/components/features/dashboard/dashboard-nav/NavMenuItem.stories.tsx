import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Music, SquarePen } from 'lucide-react';
import { NavMenuItem } from './NavMenuItem';

const meta: Meta<typeof NavMenuItem> = {
  title: 'Dashboard/Navigation/Item',
  component: NavMenuItem,
  parameters: { layout: 'centered' },
  decorators: [
    Story => (
      <div className='w-60 bg-sidebar p-3'>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof NavMenuItem>;

export const Default: Story = {
  args: {
    item: { id: 'library', name: 'Library', href: '/app/library', icon: Music },
    isActive: false,
  },
};

export const Active: Story = {
  args: {
    item: {
      id: 'library',
      name: 'Library',
      href: '/app/library',
      icon: Music,
    },
    isActive: true,
  },
};

// Elevated New Chat create row (JOV-6181): the primary tone drops the
// terminal label fade so the full label renders on the compact w-fit pill.
export const PrimaryCreate: Story = {
  args: {
    item: {
      id: 'chat',
      name: 'New Chat',
      href: '/app/chat',
      icon: SquarePen,
      tone: 'primary',
    },
    isActive: false,
  },
};
