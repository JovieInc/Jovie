import Link from 'next/link';
import '@/components/organisms/UnifiedSidebar.css';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SidebarThreadsSection } from '@/components/shell/SidebarThreadsSection';
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
    renderRecentChats: () => (
      <Link href='/app/chat/release-notes'>Release notes</Link>
    ),
  },
} satisfies Meta<typeof SidebarChatAction>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Chat: Story = {};

const openHistory: NonNullable<Story['play']> = async ({ canvasElement }) => {
  within(canvasElement).getByRole('link', { name: 'Chat' }).focus();
  await userEvent.keyboard('{ArrowRight}');
  await expect(
    within(canvasElement.ownerDocument.body).getByRole('dialog', {
      name: 'Recent Chats',
    })
  ).toBeVisible();
};

export const LoadingHistory: Story = {
  args: {
    renderRecentChats: () => (
      <SidebarThreadsSection
        activeThreadId={null}
        collapsed={false}
        state='loading'
        threads={[]}
      />
    ),
  },
  play: openHistory,
};

export const EmptyHistory: Story = {
  args: { renderRecentChats: () => <p role='status'>No recent chats</p> },
  play: openHistory,
};

export const LongChatTitle: Story = {
  args: {
    renderRecentChats: () => (
      <SidebarThreadsSection
        activeThreadId={null}
        collapsed={false}
        threads={[
          {
            id: 'release',
            href: '/app/chat/release',
            status: 'complete',
            title:
              'Revise the release announcement, touring notes, distributor questions and press outreach plan',
            updatedAt: '2026-11-26T23:00:00Z',
          },
        ]}
      />
    ),
  },
  play: openHistory,
};

export const OfflineHistory: Story = {
  args: {
    renderRecentChats: () => (
      <SidebarThreadsSection
        activeThreadId={null}
        collapsed={false}
        state='error'
        threads={[]}
        onRetry={fn()}
      />
    ),
  },
  play: openHistory,
};

export const RtlHistory: Story = {
  args: {
    renderRecentChats: () => (
      <div dir='rtl' lang='ar'>
        <Link href='/app/chat/release-notes'>ملاحظات إصدار الألبوم</Link>
      </div>
    ),
  },
  play: openHistory,
};
