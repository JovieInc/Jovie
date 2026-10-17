import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import Link from 'next/link';
import { fn } from 'storybook/test';
import { RenderedFamily } from '@/.storybook/rendered-family';
import { Icon } from '@/components/atoms/Icon';
import { APP_ROUTES } from '@/constants/routes';
import {
  type SidebarThread,
  SidebarThreadsSection,
} from './SidebarThreadsSection';

const threads: SidebarThread[] = [
  {
    id: 'thread-newer',
    href: '/app/chat/thread-newer',
    title: 'Pitch tasks',
    status: 'complete',
    updatedAt: '2026-05-12T00:00:00.000Z',
  },
  {
    id: 'thread-older',
    href: '/app/chat/thread-older',
    title: 'Release rollout',
    status: 'complete',
    updatedAt: '2026-05-10T00:00:00.000Z',
  },
];

const meta = {
  title: 'Shell/SidebarThreadsSection',
  component: SidebarThreadsSection,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['e'] },
  },
  args: {
    threads,
    activeThreadId: 'thread-newer',
    collapsed: false,
    tight: true,
  },
  decorators: [
    Story => (
      <div className='w-full max-w-60 bg-sidebar'>
        <RenderedFamily
          name='SidebarThreadsSection'
          owner='SidebarThreadsSection'
          interactive
        >
          <div className='p-3'>
            <Story />
          </div>
        </RenderedFamily>
      </div>
    ),
  ],
} satisfies Meta<typeof SidebarThreadsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RecentThreads: Story = {};

export const NewChatEmpty: Story = {
  args: {
    threads: [],
    activeThreadId: null,
    collapsed: false,
    tight: true,
    calm: true,
    onNewThread: fn(),
  },
};

export const CalmLongTitles: Story = {
  args: {
    calm: true,
    onNewThread: fn(),
    threads: threads.map((thread, index) => ({
      ...thread,
      title:
        index === 0
          ? 'Plan the full autumn release campaign with audience insights, touring updates, distribution timelines and every important detail preserved in the tooltip'
          : thread.title,
      unread: index === 1,
    })),
    onThreadContextMenu: fn(),
  },
};

export const CanonicalCreation: Story = {
  args: {
    calm: true,
    newThreadAction: (
      <Link
        href={APP_ROUTES.CHAT}
        aria-label='New Chat'
        className='flex size-6 items-center justify-center rounded-md text-sidebar-muted hover:bg-sidebar-accent focus-ring-themed'
      >
        <Icon name='Plus' className='size-3.5' aria-hidden='true' />
      </Link>
    ),
  },
};
