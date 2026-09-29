import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistMetrics } from './WaitlistMetrics';

const meta = {
  title: 'Features/Admin/WaitlistMetrics',
  component: WaitlistMetrics,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    metrics: {
      waitlisted: 1842,
      invited: 620,
      signedUp: 411,
      emailFailures: 7,
    },
  },
} satisfies Meta<typeof WaitlistMetrics>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
