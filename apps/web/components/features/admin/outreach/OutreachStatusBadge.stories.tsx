import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OutreachStatusBadge } from './OutreachStatusBadge';

const meta = {
  title: 'Features/Admin/Outreach/OutreachStatusBadge',
  component: OutreachStatusBadge,
  parameters: { layout: 'centered' },
} satisfies Meta<typeof OutreachStatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a blank status falls back to the secondary variant. */
export const EmptyStatus: Story = { args: { status: '' } };

/** Error: a failed send. */
export const ErrorFailed: Story = { args: { status: 'failed' } };

/** Partial: a status the badge has no variant for yet. */
export const PartialUnknownStatus: Story = { args: { status: 'bounced' } };

/** Long content: a multi-word status wraps its underscores to spaces. */
export const LongContentPendingReview: Story = {
  args: { status: 'pending_review_by_the_outreach_team_lead' },
};

/** Right-to-left: an Arabic status label. */
export const RtlStatus: Story = {
  args: { status: 'قيد_المراجعة' },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl'>
          <Story />
        </div>
      );
    },
  ],
};
