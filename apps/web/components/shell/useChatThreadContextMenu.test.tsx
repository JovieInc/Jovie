import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SidebarThread } from './SidebarThreadsSection';
import { useChatThreadContextMenu } from './useChatThreadContextMenu';

const mutateAsync = vi.fn();
const copySessionId = vi.fn();
const push = vi.fn();

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
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

const thread: SidebarThread = {
  id: 'conv-123',
  href: '/app/chat/conv-123',
  title: 'Pitch tasks',
  status: 'complete',
  updatedAt: '2026-05-12T00:00:00.000Z',
};

function Probe() {
  const { onThreadContextMenu, contextMenuOverlay } =
    useChatThreadContextMenu();
  return (
    <div>
      <button
        type='button'
        onClick={event => onThreadContextMenu(event, thread)}
      >
        Open menu
      </button>
      {contextMenuOverlay}
    </div>
  );
}

function renderProbe() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <Probe />
    </QueryClientProvider>
  );
}

describe('useChatThreadContextMenu', () => {
  beforeEach(() => {
    mutateAsync.mockReset();
    copySessionId.mockReset();
    push.mockReset();
    mutateAsync.mockResolvedValue({ ok: true });
  });

  it('opens archive and copy session actions from the thread menu', async () => {
    renderProbe();

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));

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
});
