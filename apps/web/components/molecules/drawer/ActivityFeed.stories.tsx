import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ActivityFeed } from './ActivityFeed';
import { ACTIVITY_ITEMS as ITEMS } from './drawer.fixtures';

const meta = {
  title: 'Molecules/Drawer/ActivityFeed',
  component: ActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [
    Story => (
      <div className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
  args: {
    items: ITEMS,
  },
} satisfies Meta<typeof ActivityFeed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Empty: Story = {
  args: {
    items: [],
  },
};

export const LongContent: Story = {
  args: {
    items: [
      {
        id: 'long',
        actor: 'The Very Long Artist Name and Collaborating Orchestra',
        verb: 'approved',
        object:
          'the extremely long tour poster revision for the summer festival run',
        at: '2026-01-15T10:05:00Z',
      },
    ],
  },
};

export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' className='w-72 bg-surface-0 p-3'>
        <Story />
      </div>
    ),
  ],
};
