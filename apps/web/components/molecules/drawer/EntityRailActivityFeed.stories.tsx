import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { drawerStoryFrame, ACTIVITY_ITEMS as ITEMS } from './drawer.fixtures';
import { EntityRailActivityFeed } from './EntityRailActivityFeed';

const meta = {
  title: 'Molecules/Drawer/EntityRailActivityFeed',
  component: EntityRailActivityFeed,
  parameters: {
    layout: 'centered',
  },
  decorators: [drawerStoryFrame('w-72 bg-surface-0 p-3')],
  args: {
    items: ITEMS,
  },
} satisfies Meta<typeof EntityRailActivityFeed>;

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
  decorators: [drawerStoryFrame('w-72 bg-surface-0 p-3', 'rtl')],
};
