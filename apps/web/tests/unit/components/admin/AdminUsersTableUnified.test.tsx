import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUsersTableUnified } from '@/components/admin/admin-users-table/AdminUsersTableUnified';

const mockUseBreakpointDown = vi.fn<
  (breakpoint: 'md' | 'lg' | 'sm' | 'xl' | '2xl') => boolean
>(() => false);
const mockUseAdminUsersInfiniteQuery = vi.fn();
const mockUseRowSelection = vi.fn();

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (breakpoint: 'md' | 'lg' | 'sm' | 'xl' | '2xl') =>
    mockUseBreakpointDown(breakpoint),
}));

vi.mock('@/lib/queries/admin-infinite', () => ({
  useAdminUsersInfiniteQuery: (params: unknown) =>
    mockUseAdminUsersInfiniteQuery(params),
}));

vi.mock('@/components/admin/table/AdminTableShell', () => ({
  AdminTableShell: ({
    children,
    toolbar,
  }: {
    children: () => ReactNode;
    toolbar?: ReactNode;
  }) => (
    <div>
      {toolbar}
      {children()}
    </div>
  ),
}));

vi.mock('@/components/organisms/table', () => ({
  convertContextMenuItems: () => [],
  ExportCSVButton: () => <button type='button'>Export</button>,
  PageToolbar: ({ start, end }: { start: ReactNode; end?: ReactNode }) => (
    <div>
      {start}
      {end}
    </div>
  ),
  TableBulkActionsToolbar: () => null,
  UnifiedTable: () => <div data-testid='desktop-table'>Desktop table</div>,
  useRowSelection: (rowIds: string[]) => mockUseRowSelection(rowIds),
}));

const userRow = {
  id: 'user_1',
  clerkId: 'clerk_1',
  name: 'Ari Lane',
  email: 'ari@example.com',
  userStatus: 'active' as const,
  createdAt: new Date('2026-01-10T00:00:00.000Z'),
  deletedAt: null,
  isPro: true,
  stripeCustomerId: null,
  stripeSubscriptionId: null,
  plan: 'pro' as const,
  profileUsername: 'ari-lane',
  profileCreatedAt: new Date('2026-01-10T00:00:00.000Z'),
  profileOrigin: 'spotify',
  founderWelcomeSentAt: null,
  welcomeFailedAt: null,
  outboundSuppressedAt: null,
  suppressionFailedAt: null,
};

describe('AdminUsersTableUnified', () => {
  it('renders mobile cards on small screens', () => {
    mockUseBreakpointDown.mockReturnValue(true);
    mockUseAdminUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [userRow], total: 1 }] },
      fetchNextPage: vi.fn().mockResolvedValue(undefined),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseRowSelection.mockReturnValue({
      selectedIds: new Set<string>(),
      selectedCount: 0,
      headerCheckboxState: false,
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      clearSelection: vi.fn(),
    });

    render(
      <TooltipProvider>
        <AdminUsersTableUnified
          users={[userRow]}
          page={1}
          pageSize={20}
          total={1}
          search=''
          sort='created_desc'
        />
      </TooltipProvider>
    );

    expect(screen.getByText('Ari Lane')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Ari Lane')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-table')).not.toBeInTheDocument();
  });

  it('renders the desktop table on wider screens', () => {
    mockUseBreakpointDown.mockReturnValue(false);
    mockUseAdminUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [userRow], total: 1 }] },
      fetchNextPage: vi.fn().mockResolvedValue(undefined),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseRowSelection.mockReturnValue({
      selectedIds: new Set<string>(),
      selectedCount: 0,
      headerCheckboxState: false,
      toggleSelect: vi.fn(),
      toggleSelectAll: vi.fn(),
      clearSelection: vi.fn(),
    });

    render(
      <TooltipProvider>
        <AdminUsersTableUnified
          users={[userRow]}
          page={1}
          pageSize={20}
          total={1}
          search=''
          sort='created_desc'
        />
      </TooltipProvider>
    );

    expect(screen.getByTestId('desktop-table')).toBeInTheDocument();
  });
});
