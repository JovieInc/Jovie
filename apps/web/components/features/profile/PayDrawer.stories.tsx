import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { PayDrawer } from './PayDrawer';

const meta = {
  title: 'Profile/PayDrawer',
  component: PayDrawer,
  args: {
    open: true,
    onOpenChange: fn(),
    artistName: 'Demo',
    artistHandle: 'demo',
    venmoLink: 'https://venmo.com/demo',
  },
} satisfies Meta<typeof PayDrawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PayNow: Story = {};
