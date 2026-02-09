import { fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardData } from '@/app/app/(shell)/dashboard/actions/dashboard-data';
import { DashboardDataProvider } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { RecentChats } from '@/components/dashboard/dashboard-nav/RecentChats';
import { SidebarProvider } from '@/components/organisms/Sidebar';
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
};

function renderRecentChats() {
  return fastRender(
    <DashboardDataProvider value={baseDashboardData}>
      <SidebarProvider>
        <RecentChats />
      </SidebarProvider>
    </DashboardDataProvider>
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

  it('renders delete button in dropdown menu', () => {
    const { getAllByText } = renderRecentChats();
    // DropdownMenu is always rendered (mocked without portal), so Delete buttons are visible
    const deleteButtons = getAllByText('Delete');
    expect(deleteButtons.length).toBe(2); // one per conversation
  });

  it('opens confirmation dialog when delete is clicked', async () => {
    const { getAllByText, getByText } = renderRecentChats();

    // Click the Delete button for the first chat
    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(getByText('Delete thread')).toBeDefined();
      // Chat title appears both in sidebar and dialog description
      expect(getAllByText(/Test Chat One/).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('calls mutateAsync and shows success on delete confirm', async () => {
    const { getAllByText, getByRole } = renderRecentChats();

    // Click Delete to open confirmation dialog
    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    // Confirm via AlertDialogAction
    await waitFor(() => {
      const confirmButton = getByRole('button', { name: /^Delete$/ });
      if (confirmButton.closest('[role="alertdialog"]')) {
        fireEvent.click(confirmButton);
      }
    });

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
    const { getAllByText, getByRole } = renderRecentChats();

    // Delete active conversation (conv-1 is active per useParams mock)
    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      const confirmButton = getByRole('button', { name: /^Delete$/ });
      if (confirmButton.closest('[role="alertdialog"]')) {
        fireEvent.click(confirmButton);
      }
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/app/chat');
    });
  });

  it('shows error notification on delete failure', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network error'));

    const { getAllByText, getByRole } = renderRecentChats();

    const deleteButtons = getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      const confirmButton = getByRole('button', { name: /^Delete$/ });
      if (confirmButton.closest('[role="alertdialog"]')) {
        fireEvent.click(confirmButton);
      }
    });

    await waitFor(() => {
      expect(mockError).toHaveBeenCalledWith('Failed to delete thread');
    });
  });
});
