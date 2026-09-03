import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
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
    layout: 'centered',
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
      <div className='w-60 bg-sidebar p-3'>
        <Story />
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
    onNewThread: fn(),
  },
};
