import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { SidebarProvider } from '@/components/organisms/Sidebar';
import { RecentChats } from '@/features/dashboard/dashboard-nav/RecentChats';
import { AppFlagProvider } from '@/lib/flags/client';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { fastRender } from '@/tests/utils/fast-render';

// Controllable mocks
const mockPush = vi.fn();
const mockMutateAsync = vi.fn();
const mockSuccess = vi.fn();
const mockError = vi.fn();

const mockConversations = [
  {
    id: 'conv-1',
    title: 'Test Chat One',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'conv-2',
    title: 'Test Chat Two',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

vi.mock('next/navigation', () => ({
  usePathname: () => '/app/chat',
  useParams: () => ({ id: 'conv-1' }),
  useRouter: () => ({ push: mockPush, replace: vi.fn(), back: vi.fn() }),
}));

vi.mock('@statsig/react-bindings', () => ({
  useFeatureGate: () => ({ value: true }),
  StatsigContext: React.createContext({ client: {} }),
}));

vi.mock('@/lib/queries/useChatConversationsQuery', () => ({
  useChatConversationsQuery: () => ({ data: mockConversations }),
}));

vi.mock('@/lib/queries/useChatMutations', () => ({
  useDeleteConversationMutation: () => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ success: mockSuccess, error: mockError }),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn(),
}));

// Mock Tooltip + DropdownMenu + AlertDialog for JSDOM compatibility
vi.mock('@jovie/ui', async () => {
  const actual = await vi.importActual<typeof import('@jovie/ui')>('@jovie/ui');
  const passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, {}, children);

  return {
    ...actual,
    // Tooltips: render children only (no duplicate content)
    Tooltip: passthrough,
    TooltipTrigger: passthrough,
    TooltipContent: () => null,
    TooltipProvider: passthrough,
    // DropdownMenu: render trigger + content without portals
    DropdownMenu: passthrough,
    DropdownMenuTrigger: ({
      children,
      asChild,
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    }) =>
      asChild
        ? React.createElement(React.Fragment, {}, children)
        : React.createElement('button', { type: 'button' }, children),
    DropdownMenuContent: ({
      children,
    }: {
      children: React.ReactNode;
      side?: string;
      align?: string;
    }) =>
      React.createElement(
        'div',
        { 'data-testid': 'dropdown-content' },
        children
      ),
    DropdownMenuItem: ({
      children,
      onClick,
      className,
    }: {
      children: React.ReactNode;
      onClick?: () => void;
      className?: string;
    }) =>
      React.createElement(
        'button',
        { onClick, className, type: 'button' },
        children
      ),
    AlertDialog: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open?: boolean;
    }) => (open ? React.createElement(React.Fragment, {}, children) : null),
    AlertDialogContent: ({ children }: { children: React.ReactNode }) =>
      React.createElement('div', { role: 'alertdialog' }, children),
    AlertDialogHeader: passthrough,
    AlertDialogFooter: passthrough,
    AlertDialogTitle: ({ children }: { children: React.ReactNode }) =>
      React.createElement('h2', {}, children),
    AlertDialogDescription: ({ children }: { children: React.ReactNode }) =>
      React.createElement('p', {}, children),
    AlertDialogCancel: ({
      children,
      disabled,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
    }) => React.createElement('button', { disabled, type: 'button' }, children),
    AlertDialogAction: ({
      children,
      disabled,
      onClick,
    }: {
      children: React.ReactNode;
      disabled?: boolean;
      onClick?: () => void;
      variant?: string;
    }) =>
      React.createElement(
        'button',
        { disabled, onClick, type: 'button' },
        children
      ),
  };
});

const baseDashboardData: DashboardData = {
  user: { id: 'user_123' },
  creatorProfiles: [],
  selectedProfile: null,
  needsOnboarding: false,
  sidebarCollapsed: false,
  hasSocialLinks: false,
  hasMusicLinks: false,
  isAdmin: false,
  tippingStats: {
    tipClicks: 0,
    qrTipClicks: 0,
    linkTipClicks: 0,
    tipsSubmitted: 0,
    totalReceivedCents: 0,
    monthReceivedCents: 0,
  },
  profileCompletion: {
    percentage: 0,
    completedCount: 0,
    totalCount: 6,
    steps: [],
    profileIsLive: false,
  },
};

function renderRecentChats({
  shellChatV1 = false,
}: Readonly<{ shellChatV1?: boolean }> = {}) {
  return fastRender(
    <AppFlagProvider
      initialFlags={{ ...APP_FLAG_DEFAULTS, SHELL_CHAT_V1: shellChatV1 }}
    >
      <DashboardDataProvider value={baseDashboardData}>
        <SidebarProvider>
          <RecentChats />
        </SidebarProvider>
      </DashboardDataProvider>
    </AppFlagProvider>
  );
}

function getDialogDeleteButton() {
  const dialog = screen.getByRole('alertdialog');
  return Array.from(dialog.querySelectorAll('button')).find(
    button => button.textContent?.trim() === 'Delete'
  );
}

describe('RecentChats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMutateAsync.mockResolvedValue(undefined);
  });

  it('renders conversation titles', () => {
    const { getAllByText } = renderRecentChats();
    expect(getAllByText('Test Chat One').length).toBeGreaterThanOrEqual(1);
    expect(getAllByText('Test Chat Two').length).toBeGreaterThanOrEqual(1);
  });

  it('uses shell threads for navigation when Shell Chat V1 is enabled', () => {
    const { getByRole } = renderRecentChats({ shellChatV1: true });

    fireEvent.click(getByRole('button', { name: /Test Chat Two/ }));

    expect(mockPush).toHaveBeenCalledWith('/app/chat/conv-2');
  });

  it('renders delete button in dropdown menu', () => {
    const { getAllByText } = renderRecentChats();
    // DropdownMenu is always rendered (mocked without portal), so Delete buttons are visible
    const deleteButtons = getAllByText('Delete');
    expect(deleteButtons.length).toBe(2); // one per conversation
  });

  it('opens confirmation dialog when delete is clicked', async () => {
    const { getAllByText } = renderRecentChats();

    // Click the Delete button for the first chat
    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText('Delete Thread')).toBeDefined();
    expect(within(dialog).getByText(/Test Chat One/)).toBeDefined();
  });

  it('calls mutateAsync and shows success on delete confirm', async () => {
    const { getAllByText } = renderRecentChats();

    // Click Delete to open confirmation dialog
    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // Confirm via AlertDialogAction
    await screen.findByRole('alertdialog');
    fireEvent.click(getDialogDeleteButton() as HTMLButtonElement);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        conversationId: 'conv-1',
      });
    });

    await waitFor(() => {
      expect(mockSuccess).toHaveBeenCalledWith('Thread deleted');
    });
  });

  it('navigates to /app/chat when deleting the active conversation', async () => {
    const { getAllByText } = renderRecentChats();

    // Delete active conversation (conv-1 is active per useParams mock)
    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await screen.findByRole('alertdialog');
    fireEvent.click(getDialogDeleteButton() as HTMLButtonElement);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/app/chat');
    });
  });

  it('shows error notification on delete failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));

    const { getAllByText } = renderRecentChats();

    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await screen.findByRole('alertdialog');
    fireEvent.click(getDialogDeleteButton() as HTMLButtonElement);

    await waitFor(() => {
      expect(mockError).toHaveBeenCalledWith('Failed to delete thread');
    });
  });
});
