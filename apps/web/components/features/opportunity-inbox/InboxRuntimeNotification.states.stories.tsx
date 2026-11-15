import '@/styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RuntimeUpdateProvider } from '@/components/shell/RuntimeUpdateProvider';
import { InboxRuntimeNotification } from './InboxRuntimeNotification';

const meta = {
  title: 'OpportunityInbox/InboxRuntimeNotification States',
  component: InboxRuntimeNotification,
  parameters: { layout: 'padded' },
  decorators: [
    function MetaDecorator(Story) {
      return (
        <RuntimeUpdateProvider>
          <div className='w-80 p-4'>
            <Story />
          </div>
        </RuntimeUpdateProvider>
      );
    },
  ],
} satisfies Meta<typeof InboxRuntimeNotification>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rtl: the update slot above an Arabic inbox in a right-to-left document. */
export const Rtl: Story = {
  render: () => (
    <div dir='rtl' lang='ar' className='space-y-3'>
      <InboxRuntimeNotification />
      <p className='text-sm text-secondary-token'>صندوق الوارد</p>
    </div>
  ),
};
