import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';
import { RenderedFamily } from '@/.storybook/rendered-family';
import {
  type SidebarThread,
  SidebarThreadsSection,
} from './SidebarThreadsSection';

const threads: SidebarThread[] = [
  {
    id: 'thread-running',
    href: '/app/chat/thread-running',
    title: 'Pitch tasks',
    status: 'running',
    updatedAt: '2026-05-12T00:00:00.000Z',
  },
  {
    id: 'thread-errored',
    href: '/app/chat/thread-errored',
    title: 'Release rollout',
    status: 'errored',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
  {
    id: 'thread-unread',
    href: '/app/chat/thread-unread',
    title: 'Tour poster copy',
    status: 'complete',
    unread: true,
    updatedAt: '2026-05-10T00:00:00.000Z',
  },
];

/** Rendered states of the sidebar chat history section. */
const meta = {
  title: 'Shell/SidebarThreadsSection/States',
  component: SidebarThreadsSection,
  parameters: {
    layout: 'fullscreen',
    jovie: { uncoveredProps: ['e'] },
  },
  args: {
    threads,
    activeThreadId: null,
    collapsed: false,
    tight: true,
  },
  decorators: [
    function SidebarThreadsRail(Story) {
      return (
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
      );
    },
  ],
} satisfies Meta<typeof SidebarThreadsSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Loading: the first page of chats has not arrived yet. */
export const LoadingFirstPage: Story = {
  args: { threads: [], state: 'loading', onNewThread: fn() },
};

/** Empty: no chats yet, with the new-chat action. */
export const EmptyHistory: Story = {
  args: { threads: [], calm: true, onNewThread: fn() },
};

/** Error: the history failed to load and offers a retry. */
export const ErrorWithRetry: Story = {
  args: { threads: [], state: 'error', onRetry: fn(), onNewThread: fn() },
};

/** Partial: a refresh failed but the chats already loaded stay listed. */
export const PartialStaleListAfterError: Story = {
  args: { state: 'error', onRetry: fn(), activeThreadId: 'thread-running' },
};

/** Long content: long titles truncate beside the row actions. */
export const LongContentTitles: Story = {
  args: {
    onThreadContextMenu: fn(),
    threads: threads.map((thread, index) => ({
      ...thread,
      title:
        index === 0
          ? 'Plan the full autumn release campaign with audience insights, touring updates and distribution timelines'
          : thread.title,
    })),
  },
};

/** RTL: dots, titles and the header mirror in a right-to-left rail. */
export const RtlHistory: Story = {
  args: {
    threads: threads.map(thread => ({ ...thread, title: 'خطة الإصدار' })),
  },
  render: function RtlHistoryRender(args) {
    return (
      <div dir='rtl'>
        <SidebarThreadsSection {...args} />
      </div>
    );
  },
};
