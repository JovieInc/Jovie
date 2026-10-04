import { TooltipProvider } from '@jovie/ui';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AdminUsersTableUnified } from '@/components/features/admin/admin-users-table/AdminUsersTableUnified';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AdminPeopleRightPanelProvider } from '@/features/admin/AdminPeopleRightPanelProvider';

const mockUseBreakpointDown = vi.fn<
  (breakpoint: 'md' | 'lg' | 'sm' | 'xl' | '2xl') => boolean
>(() => false);
const mockUseAdminUsersInfiniteQuery = vi.fn();
const mockUseRowSelection = vi.fn();

vi.mock('next/navigation', async importOriginal => {
  const actual = await importOriginal<typeof import('next/navigation')>();

  return {
    ...actual,
    useRouter: vi.fn(() => ({
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
    })),
    usePathname: vi.fn(() => '/admin/users'),
    useSearchParams: vi.fn(() => new URLSearchParams()),
  };
});

vi.mock('@/hooks/useBreakpoint', () => ({
  useBreakpointDown: (breakpoint: 'md' | 'lg' | 'sm' | 'xl' | '2xl') =>
    mockUseBreakpointDown(breakpoint),
}));

vi.mock('@/lib/queries/admin-infinite', () => ({
  useAdminUsersInfiniteQuery: (params: unknown) =>
    mockUseAdminUsersInfiniteQuery(params),
}));

vi.mock('@/features/admin/table/AdminTableShell', () => ({
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

vi.mock('@/hooks/useSearchUrlSync', () => ({
  useSearchUrlSync: () => {},
}));

vi.mock('@/components/organisms/table', () => ({
  TABLE_CELL_MULTILINE_CONTENT_CLASSNAME: 'whitespace-normal',
  convertContextMenuItems: () => [],
  createMultiFieldFilterFn: () => () => true,
  ExportCSVButton: () => <button type='button'>Export</button>,
  PAGE_TOOLBAR_END_GROUP_CLASS: 'page-toolbar-end-group',
  PAGE_TOOLBAR_META_TEXT_CLASS: 'page-toolbar-meta-text',
  PageToolbar: ({ start, end }: { start: ReactNode; end?: ReactNode }) => (
    <div>
      {start}
      {end}
    </div>
  ),
  PageToolbarActionButton: ({
    label,
    ariaLabel,
  }: {
    label: ReactNode;
    ariaLabel: string;
  }) => (
    <button type='button' aria-label={ariaLabel}>
      {label}
    </button>
  ),
  PageToolbarSearchForm: ({ submitAriaLabel }: { submitAriaLabel: string }) => (
    <button type='submit'>{submitAriaLabel}</button>
  ),
  TableBulkActionsToolbar: () => null,
  UnifiedTable: ({
    columns,
    rowMode,
  }: {
    columns: Array<{ id: string; meta?: { cellContentClassName?: string } }>;
    rowMode?: string;
  }) => (
    <div
      data-testid='desktop-table'
      data-row-mode={rowMode}
      data-multiline-columns={columns
        .filter(column =>
          column.meta?.cellContentClassName?.includes('whitespace-normal')
        )
        .map(column => column.id)
        .join(',')}
    >
      Desktop table
    </div>
  ),
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

function RightPanelOutlet() {
  return <div data-testid='global-right-rail'>{useRightPanel()}</div>;
}

function renderUsersTable() {
  return render(
    <TooltipProvider>
      <RightPanelProvider>
        <AdminPeopleRightPanelProvider>
          <HeaderActionsProvider>
            <TableMetaProvider>
              <AdminUsersTableUnified
                users={[userRow]}
                page={1}
                pageSize={20}
                total={1}
                search=''
                sort='created_desc'
              />
            </TableMetaProvider>
          </HeaderActionsProvider>
        </AdminPeopleRightPanelProvider>
        <RightPanelOutlet />
      </RightPanelProvider>
    </TooltipProvider>
  );
}

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

    renderUsersTable();

    expect(screen.getByText('Ari Lane')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Ari Lane')).toBeInTheDocument();
    expect(screen.queryByTestId('desktop-table')).not.toBeInTheDocument();
  });

  it.each([0, 1])(
    'keeps desktop metadata but excludes covered actions with %i selected rows',
    selectedCount => {
      mockUseBreakpointDown.mockReturnValue(false);
      mockUseAdminUsersInfiniteQuery.mockReturnValue({
        data: { pages: [{ rows: [userRow], total: 1 }] },
        fetchNextPage: vi.fn().mockResolvedValue(undefined),
        hasNextPage: false,
        isFetchingNextPage: false,
      });
      mockUseRowSelection.mockReturnValue({
        selectedIds: new Set<string>(),
        selectedCount,
        headerCheckboxState: false,
        toggleSelect: vi.fn(),
        toggleSelectAll: vi.fn(),
        clearSelection: vi.fn(),
      });

      renderUsersTable();

      // People rows are one line (face, name, email) at the 32px dense mode.
      expect(screen.getByTestId('desktop-table')).toHaveAttribute(
        'data-multiline-columns',
        ''
      );
      expect(screen.getByTestId('desktop-table')).toHaveAttribute(
        'data-row-mode',
        'dense'
      );
      expect(screen.getByTestId('desktop-table')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Users' })).toBeNull();
      expect(screen.getByText(/Showing 1–1 of 1 users/)).toBeInTheDocument();
      const exportButton = screen.getByRole('button', {
        name: 'Export',
        hidden: true,
      });
      expect(exportButton.closest('[inert]') !== null).toBe(selectedCount > 0);
      expect(screen.queryByRole('button', { name: 'Export' }) !== null).toBe(
        selectedCount === 0
      );
    }
  );
});
