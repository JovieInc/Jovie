import '@/app/globals.css';
import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { OpportunityInboxEmptyState } from './OpportunityInboxEmptyState';

const meta = {
  title: 'Dashboard/Opportunity Inbox/Empty State States',
  component: OpportunityInboxEmptyState,
  parameters: { layout: 'fullscreen' },
  render: args => (
    <div className='min-h-screen bg-(--app-shell-content-surface) px-3 py-5'>
      <OpportunityInboxEmptyState {...args} />
    </div>
  ),
} satisfies Meta<typeof OpportunityInboxEmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Empty: a cleared inbox with no setup data. */
export const EmptyInboxClear: Story = {};

/** Rtl: the first-run setup checklist in a right-to-left document. */
export const Rtl: Story = {
  args: {
    setup: { profileComplete: true, musicConnected: false, linksAdded: false },
  },
  decorators: [
    function RtlDecorator(Story) {
      return (
        <div dir='rtl' lang='ar'>
          <Story />
        </div>
      );
    },
  ],
};
