import { TooltipProvider } from '@jovie/ui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { HeaderActionsProvider } from '@/contexts/HeaderActionsContext';
import {
  RightPanelProvider,
  useRightPanel,
} from '@/contexts/RightPanelContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import { AdminPeopleRightPanelProvider } from '@/features/admin/AdminPeopleRightPanelProvider';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminUsersTableUnified } from './AdminUsersTableUnified';

const mockUseBreakpointDown = vi.fn<
  (breakpoint: 'md' | 'lg' | 'sm' | 'xl' | '2xl') => boolean
>(() => false);
const mockUseAdminUsersInfiniteQuery = vi.fn();
const mockUseRowSelection = vi.fn();
let capturedDesktopColumnIds: string[] = [];
let capturedActionCallbacks: {
  onBanUser: (user: typeof userRow) => void;
} | null = null;

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

vi.mock('./admin-user-actions', () => ({
  buildAdminUserActions: (
    _user: unknown,
    callbacks: { onBanUser: (user: typeof userRow) => void }
  ) => {
    capturedActionCallbacks = callbacks;
    return [];
  },
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
  }) => {
    capturedDesktopColumnIds = columns.map(column => column.id);
    return (
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
    );
  },
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
    expect(
      screen.getByLabelText('Select Ari Lane').closest('.overflow-auto')
    ).toHaveClass('min-h-0', 'flex-1', 'overflow-auto');
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

  it('builds the memoized column contract handed to the desktop table', () => {
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

    renderUsersTable();

    expect(capturedDesktopColumnIds).toEqual([
      'select',
      'name',
      'username',
      'created',
      'profile',
      'plan',
      'status',
      'suppression',
      'welcome',
      'actions',
    ]);
  });
});

describe('AdminUsersTableUnified selection checkbox', () => {
  const toggleSelect = vi.fn();

  function mockMobile(selected: boolean) {
    mockUseBreakpointDown.mockReturnValue(true);
    mockUseAdminUsersInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [userRow], total: 1 }] },
      fetchNextPage: vi.fn().mockResolvedValue(undefined),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    mockUseRowSelection.mockReturnValue({
      selectedIds: new Set<string>(selected ? [userRow.id] : []),
      selectedCount: selected ? 1 : 0,
      headerCheckboxState: false,
      toggleSelect,
      toggleSelectAll: vi.fn(),
      clearSelection: vi.fn(),
    });
  }

  it('toggles selection through the canonical Checkbox atom', async () => {
    const user = userEvent.setup();
    toggleSelect.mockClear();
    mockMobile(false);
    renderUsersTable();

    const checkbox = screen.getByRole('checkbox', { name: 'Select Ari Lane' });
    expect(checkbox).toHaveAttribute('data-state', 'unchecked');
    await user.click(checkbox);
    expect(toggleSelect).toHaveBeenCalledWith('user_1');
    await user.keyboard('[Space]');
    expect(toggleSelect).toHaveBeenCalledTimes(2);
    expect(checkbox).toHaveFocus();
  });

  it('shows the checked state and stays axe-clean on mobile and desktop', async () => {
    mockMobile(true);
    const mobile = renderUsersTable();
    expect(
      screen.getByRole('checkbox', { name: 'Select Ari Lane' })
    ).toHaveAttribute('data-state', 'checked');
    await expectNoA11yViolations(mobile.container);
    mobile.unmount();

    mockUseBreakpointDown.mockReturnValue(false);
    const desktop = renderUsersTable();
    await expectNoA11yViolations(desktop.container);
  });
});

describe('AdminUsersTableUnified suspend dialog', () => {
  it('keeps the typed reason and focus while the user types', async () => {
    const user = userEvent.setup();
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

    act(() => capturedActionCallbacks?.onBanUser(userRow));
    const reason = await screen.findByLabelText('Reason (required)');
    const confirm = screen.getByRole('button', { name: 'Suspend user' });
    expect(confirm).toBeDisabled();
    await user.type(reason, 'Spam links');
    expect(reason).toHaveValue('Spam links');
    expect(confirm).toBeEnabled();
    expect(reason).toHaveFocus();
  });
});

describe('AdminUsersTableUnified text contrast contract (JOV-8873)', () => {
  it('uses the Checkbox atom, not a raw checkbox input with its own tint', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const webRoot = process.cwd().endsWith('/apps/web')
      ? process.cwd()
      : resolve(process.cwd(), 'apps/web');
    const source = readFileSync(
      resolve(
        webRoot,
        'components/features/admin/admin-users-table/AdminUsersTableUnified.tsx'
      ),
      'utf8'
    );
    expect(source).toContain('<Checkbox');
    expect(source).not.toContain("type='checkbox'");
    expect(source).not.toContain('text-(--linear-accent)');
  });
});
