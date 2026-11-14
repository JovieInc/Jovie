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

/** A receipt with no contact email: the next steps ask for one instead. */
export const PartialNoContactEmail: Story = {
  args: {
    outcome: 'pending',
    email: null,
  },
};

/** A long contact email and the capacity-full copy wrap inside the card. */
export const LongContactEmail: Story = {
  args: {
    outcome: 'waitlisted_capacity_full',
    email: 'booking.and.management.team@example-records-group.com',
  },
};

/**
 * The intake request never reached the server: WaitlistIntakeChat maps a
 * thrown fetch to save_failed, so offline shows the retry receipt.
 */
export const OfflineSaveFailed: Story = {
  args: {
    outcome: 'save_failed',
    email: null,
    onRetry: () => undefined,
  },
};

/** The pending receipt inside a right-to-left page. */
export const Rtl: Story = {
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
