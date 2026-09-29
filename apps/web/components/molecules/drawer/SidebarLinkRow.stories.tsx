import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AtSign } from 'lucide-react';
import { fn } from 'storybook/test';
import { SidebarLinkRow } from './SidebarLinkRow';

const meta = {
  title: 'Molecules/Drawer/SidebarLinkRow',
  component: SidebarLinkRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-1 p-2'>
        <Story />
      </div>
    ),
  ],
  args: {
    icon: <AtSign className='h-4 w-4' />,
    label: 'Instagram',
    url: 'https://instagram.com/jovie',
  },
} satisfies Meta<typeof SidebarLinkRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithBadge: Story = {
  args: {
    badge: 'New',
  },
};

export const Editable: Story = {
  args: {
    isEditable: true,
    onRemove: fn(),
  },
};

export const Removing: Story = {
  args: {
    isEditable: true,
    isRemoving: true,
    onRemove: fn(),
  },
};

export const Hidden: Story = {
  args: {
    isVisible: false,
  },
};

export const TrackSurface: Story = {
  args: {
    surfaceVariant: 'track',
  },
};
