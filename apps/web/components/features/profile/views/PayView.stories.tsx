import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { PayView } from './PayView';

const meta = {
  title: 'Profile/PayView',
  component: PayView,
  args: {
    artistHandle: 'demo',
    venmoLink: 'https://venmo.com/demo',
  },
} satisfies Meta<typeof PayView>;

export default meta;
export const PayNow: StoryObj<typeof meta> = {};
