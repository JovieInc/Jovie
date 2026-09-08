import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistIntakeChat } from './WaitlistIntakeChat';

const meta = {
  title: 'Features/Waitlist/WaitlistIntakeChat',
  component: WaitlistIntakeChat,
  parameters: {
    layout: 'centered',
    jovie: {
      uncoveredProps: ['disabled'],
    },
  },
  args: {
    userEmail: 'artist@example.com',
  },
} satisfies Meta<typeof WaitlistIntakeChat>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
