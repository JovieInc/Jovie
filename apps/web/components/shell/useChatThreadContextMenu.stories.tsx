import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fireEvent, userEvent, within } from 'storybook/test';
import type { SidebarThread } from './SidebarThreadsSection';
import { useChatThreadContextMenu } from './useChatThreadContextMenu';

/**
 * useChatThreadContextMenu — the right-click menu for sidebar chat threads
 * (Copy Session ID, Archive). Stories render a small thread list wired to
 * the hook and open the menu in `play`.
 */

const THREADS: readonly SidebarThread[] = [
  {
    id: 'conv-pitch',
    title: 'Pitch tasks',
    status: 'complete',
    updatedAt: '2026-05-12T00:00:00.000Z',
  },
  {
    id: 'conv-release',
    title: 'Release plan for Lost in the Light',
    status: 'complete',
    updatedAt: '2026-05-11T00:00:00.000Z',
  },
];

const RTL_THREADS: readonly SidebarThread[] = [
  {
    id: 'conv-rtl',
    title: 'خطة إطلاق الألبوم',
    status: 'complete',
    updatedAt: '2026-05-12T00:00:00.000Z',
  },
];

function ThreadMenuDemo({
  threads,
  activeThreadId = null,
  dir,
}: {
  readonly threads: readonly SidebarThread[];
  readonly activeThreadId?: string | null;
  readonly dir?: 'ltr' | 'rtl';
}) {
  const { onThreadContextMenu, contextMenuOverlay } = useChatThreadContextMenu({
    activeThreadId,
  });

  return (
    <div
      dir={dir}
      lang={dir === 'rtl' ? 'ar' : undefined}
      className='w-64 bg-sidebar p-2 text-primary-token'
    >
      <ul aria-label='Chats' className='flex flex-col gap-0.5'>
        {threads.map(thread => (
          <li key={thread.id}>
            <button
              type='button'
              className='w-full truncate rounded-md px-2 py-1 text-start text-xs hover:bg-surface-1'
              onContextMenu={event => onThreadContextMenu(event, thread)}
            >
              {thread.title}
            </button>
          </li>
        ))}
      </ul>
      {contextMenuOverlay}
    </div>
  );
}

const meta = {
  title: 'Shell/useChatThreadContextMenu',
  component: ThreadMenuDemo,
  parameters: { layout: 'centered' },
  args: { threads: THREADS },
} satisfies Meta<typeof ThreadMenuDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

async function openMenu(canvasElement: HTMLElement, name: string) {
  const row = within(canvasElement).getByRole('button', { name });
  fireEvent.contextMenu(row, { clientX: 40, clientY: 40 });
  const body = within(canvasElement.ownerDocument.body);
  await expect(
    await body.findByRole('menuitem', { name: 'Archive' })
  ).toBeInTheDocument();
  return body;
}

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement, 'Pitch tasks');
  },
};

/** Archive without an API behind Storybook: the request fails and the
 *  hook reports "Could not archive conversation". */
export const ErrorArchiveFailed: Story = {
  play: async ({ canvasElement }) => {
    const body = await openMenu(canvasElement, 'Pitch tasks');
    await userEvent.click(body.getByRole('menuitem', { name: 'Archive' }));
  },
};

export const Rtl: Story = {
  args: { threads: RTL_THREADS, dir: 'rtl' },
  play: async ({ canvasElement }) => {
    await openMenu(canvasElement, 'خطة إطلاق الألبوم');
  },
};
