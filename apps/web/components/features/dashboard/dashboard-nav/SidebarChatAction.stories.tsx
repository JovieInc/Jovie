import Link from 'next/link';
import '@/components/organisms/UnifiedSidebar.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { SidebarChatAction } from './SidebarChatAction';

const meta = {
  title: 'Shell/SidebarChatAction',
  component: SidebarChatAction,
  decorators: [
    Story => (
      <div data-pen-sidebar className='w-(--app-shell-sidebar-width)'>
        <Story />
      </div>
    ),
  ],
  args: {
    current: false,
    pending: false,
    onActivate: fn(event => event.preventDefault()),
    recentChats: <Link href='/app/chat/release-notes'>Release notes</Link>,
  },
} satisfies Meta<typeof SidebarChatAction>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chat: Story = {};
export const OpeningComposer: Story = { args: { pending: true } };
