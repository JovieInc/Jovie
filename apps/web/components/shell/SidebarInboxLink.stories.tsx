import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { SidebarInboxLink } from './SidebarInboxLink';

const meta = {
  title: 'Shell/SidebarInboxLink',
  component: SidebarInboxLink,
  decorators: [
    Story => (
      <RenderedFamily
        name='sidebar-inbox-link'
        owner='SidebarInboxLink'
        interactive
      >
        <Story />
      </RenderedFamily>
    ),
    Story => (
      <div className='flex items-center gap-3 p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarInboxLink>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {
  args: { availability: { state: 'available', pendingCount: 3 } },
};

export const CaughtUp: Story = {
  args: { availability: { state: 'empty', pendingCount: 0 } },
};

export const StatusUnavailable: Story = {
  args: { availability: { state: 'unknown', pendingCount: null } },
};

/** Nothing waits in the Inbox: the bell carries no attention dot. */
export const EmptyInbox: Story = {
  args: { availability: { state: 'empty', pendingCount: 0 } },
};

/** A large backlog lengthens only the tooltip and accessible name. */
export const LongContentLargeBacklog: Story = {
  args: { availability: { state: 'available', pendingCount: 12840 } },
};

export const Rtl: Story = {
  args: { availability: { state: 'available', pendingCount: 3 } },
  decorators: [
    Story => (
      <div dir='rtl' lang='ar'>
        <Story />
      </div>
    ),
  ],
};
