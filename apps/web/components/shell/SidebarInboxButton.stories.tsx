import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SidebarInboxButton } from './SidebarInboxButton';

const meta = {
  title: 'Shell/SidebarInboxButton',
  component: SidebarInboxButton,
  decorators: [
    Story => (
      <div className='flex items-center gap-3 p-4'>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarInboxButton>;

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
