import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { WaitlistOutcomeView } from './WaitlistOutcomeView';

const meta = {
  title: 'Marketing/Routes/WaitlistOutcomeView',
  component: WaitlistOutcomeView,
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'dark' },
    docs: {
      description: {
        component:
          'Source-backed waitlist outcome card for the authenticated /waitlist receipt and retry states.',
      },
    },
  },
  args: {
    outcome: 'pending',
    email: 'artist@example.com',
  },
} satisfies Meta<typeof WaitlistOutcomeView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PendingReceipt: Story = {};

export const SaveFailedRetry: Story = {
  args: {
    outcome: 'save_failed',
    onRetry: () => undefined,
  },
};
