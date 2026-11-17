import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { drawerStoryFrame } from './drawer.fixtures';
import { StatRow } from './StatRow';

const meta = {
  title: 'Molecules/Drawer/StatRow States',
  component: StatRow,
  parameters: {
    layout: 'centered',
  },
  decorators: [drawerStoryFrame('w-72 bg-surface-0 p-3')],
  args: {
    stats: [],
  },
} satisfies Meta<typeof StatRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: the owner has no stats yet, so the three-slot grid is blank. */
export const EmptyNoStats: Story = {};
