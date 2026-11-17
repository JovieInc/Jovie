import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import type { SidebarThread } from './SidebarThreadsSection';
import { useChatThreadContextMenu } from './useChatThreadContextMenu';

const mutateAsync = vi.fn();
const copySessionId = vi.fn();
const push = vi.fn();
const notifySuccess = vi.fn();
const notifyError = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/lib/queries', () => ({
  useDeleteConversationMutation: () => ({
    mutateAsync,
  }),
}));

vi.mock('@/hooks/useClipboard', () => ({
  useClipboard: (options?: { onSuccess?: () => void }) => ({
    copy: async (value: string) => {
      copySessionId(value);
      options?.onSuccess?.();
    },
    isSuccess: false,
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({
    success: notifySuccess,
    error: notifyError,
  }),
}));

const thread: SidebarThread = {
  id: 'conv-123',
  href: '/app/chat/conv-123',
  title: 'Pitch tasks',
  status: 'complete',
  updatedAt: '2026-05-12T00:00:00.000Z',
};

function Probe({
  activeThreadId = null,
  target = thread,
}: {
  readonly activeThreadId?: string | null;
  readonly target?: SidebarThread;
}) {
  const { onThreadContextMenu, contextMenuOverlay } = useChatThreadContextMenu({
    activeThreadId,
  });
  return (
    <div>
      <button
        type='button'
        onClick={event => onThreadContextMenu(event, target)}
      >
        Open menu
      </button>
      {contextMenuOverlay}
    </div>
  );
}

function renderProbe(props: Parameters<typeof Probe>[0] = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe {...props} />
    </QueryClientProvider>
  );
}

describe('useChatThreadContextMenu', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    copySessionId.mockReset();
    push.mockReset();
    notifySuccess.mockReset();
    notifyError.mockReset();
    mutateAsync.mockResolvedValue({ ok: true });
  });

  it('opens archive and copy session actions from the thread menu', async () => {
    const { container } = renderProbe();
    await expectNoA11yViolations(container);

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(container).toContainElement(
      screen.getByRole('menuitem', { name: 'Archive' })
    );
    await expectNoA11yViolations(container);

    expect(
      screen.getByRole('menuitem', { name: 'Copy Session ID' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Archive' })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Session ID' }));
    expect(copySessionId).toHaveBeenCalledWith('conv-123');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ conversationId: 'conv-123' });
    });
  });

  it('returns to the chat home after archiving the active thread', async () => {
    renderProbe({ activeThreadId: 'conv-123' });

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(notifySuccess).toHaveBeenCalledWith('Chat archived')
    );
    expect(push).toHaveBeenCalledWith('/app/chat');
  });

  it('reports a failed archive and stays on the thread', async () => {
    mutateAsync.mockRejectedValueOnce(new Error('network'));
    const { container } = renderProbe({ activeThreadId: 'conv-123' });

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));

    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('Could not archive conversation')
    );
    expect(push).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
    await expectNoA11yViolations(container);
  });

  it('opens the same actions for a right-to-left thread', async () => {
    const rtlThread: SidebarThread = {
      ...thread,
      id: 'conv-rtl',
      title: 'خطة إطلاق الألبوم',
    };
    const queryClient = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <div dir='rtl' lang='ar'>
          <Probe target={rtlThread} />
        </div>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy Session ID' }));
    expect(copySessionId).toHaveBeenCalledWith('conv-rtl');
    await expectNoA11yViolations(container);
  });
});
