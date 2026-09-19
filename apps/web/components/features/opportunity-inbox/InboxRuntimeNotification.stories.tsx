import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RuntimeUpdateProvider } from '@/components/shell/RuntimeUpdateProvider';
import { InboxRuntimeNotification } from './InboxRuntimeNotification';

const meta = {
  title: 'OpportunityInbox/InboxRuntimeNotification',
  component: InboxRuntimeNotification,
  parameters: {
    layout: 'padded',
  },
  decorators: [
    Story => (
      <RuntimeUpdateProvider>
        <div className='w-80 p-4'>
          <Story />
        </div>
      </RuntimeUpdateProvider>
    ),
  ],
} satisfies Meta<typeof InboxRuntimeNotification>;
export default meta;
type Story = StoryObj<typeof meta>;

export const HiddenWithoutUpdate: Story = {};

export const InInboxStack: Story = {
  render: () => (
    <div className='space-y-3'>
      <InboxRuntimeNotification />
      <p className='text-sm text-secondary-token'>
        The notification slots above the Inbox feed; without an update it
        renders nothing.
      </p>
    </div>
  ),
};
