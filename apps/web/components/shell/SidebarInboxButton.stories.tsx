import '../../styles/system-b-app.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { InboxRuntimeNotification } from '@/components/features/opportunity-inbox/InboxRuntimeNotification';
import { RuntimeUpdateProvider } from './RuntimeUpdateProvider';
import { SidebarInboxButton } from './SidebarInboxButton';

const meta = {
  title: 'Shell/SidebarInboxButton',
  component: SidebarInboxButton,
  args: { availability: { state: 'available', pendingCount: 3 } },
} satisfies Meta<typeof SidebarInboxButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Pending: Story = {};
export const CaughtUp: Story = {
  args: { availability: { state: 'empty', pendingCount: 0 } },
};
export const Unknown: Story = {
  args: { availability: { state: 'unknown', pendingCount: null } },
};
export const RuntimeUpdate: Story = {
  render: () => (
    <RuntimeUpdateProvider>
      <div className='w-80 space-y-3'>
        <h1>Inbox</h1>
        <SidebarInboxButton
          availability={{ state: 'empty', pendingCount: 0 }}
        />
        <InboxRuntimeNotification />
      </div>
    </RuntimeUpdateProvider>
  ),
};
