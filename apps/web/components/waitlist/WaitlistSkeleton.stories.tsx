import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistSkeleton } from './WaitlistSkeleton';

const meta: Meta<typeof WaitlistSkeleton> = {
  title: 'Waitlist/WaitlistSkeleton',
  component: WaitlistSkeleton,
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<typeof WaitlistSkeleton>;

export const Default: Story = {};
