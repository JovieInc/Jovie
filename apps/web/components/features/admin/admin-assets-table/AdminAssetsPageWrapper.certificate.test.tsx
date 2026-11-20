import { TooltipProvider } from '@jovie/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HeaderActionsProvider,
  useHeaderActions,
} from '@/contexts/HeaderActionsContext';
import { TableMetaProvider } from '@/contexts/TableMetaContext';
import type { AdminAssetRow } from '@/lib/admin/types';
import { expectNoA11yViolations } from '@/tests/utils/a11y';
import { AdminAssetsPageWrapper } from './AdminAssetsPageWrapper';
import { assets } from './story-fixtures';

const { mockUseAdminAssetsInfiniteQuery } = vi.hoisted(() => ({
  mockUseAdminAssetsInfiniteQuery: vi.fn(),
}));

vi.mock('nuqs', () => ({
  parseAsString: {},
  parseAsStringLiteral: () => ({ withDefault: (value: unknown) => value }),
  useQueryStates: () => [{}, vi.fn()],
}));

vi.mock('@/lib/queries', () => ({
  useAdminAssetsInfiniteQuery: mockUseAdminAssetsInfiniteQuery,
  useStartImpersonationMutation: () => ({ mutate: vi.fn() }),
}));

function HeaderSlot() {
  const { headerActions } = useHeaderActions();
  return <section aria-label='Page header'>{headerActions}</section>;
}

function Shell({ children }: { readonly children: ReactNode }) {
  return (
    <HeaderActionsProvider>
      <QueryClientProvider client={new QueryClient()}>
        <TableMetaProvider>
          <TooltipProvider>
            <HeaderSlot />
            <main>{children}</main>
          </TooltipProvider>
        </TableMetaProvider>
      </QueryClientProvider>
    </HeaderActionsProvider>
  );
}

const props = (rows: AdminAssetRow[]) => ({
  assets: rows,
  pageSize: 20,
  total: rows.length,
  search: '',
  sort: 'created_desc' as const,
  type: 'all' as const,
  issues: 'all' as const,
  verified: 'all' as const,
});

function seed(rows: AdminAssetRow[]) {
  mockUseAdminAssetsInfiniteQuery.mockReturnValue({
    data: { pages: [{ rows, total: rows.length }] },
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  });
}

describe('AdminAssetsPageWrapper certificate', () => {
  beforeEach(() => {
    mockUseAdminAssetsInfiniteQuery.mockReset();
  });

  it('puts the drawer toggle in the page header and keeps the table axe-clean', async () => {
    seed(assets);
    const { container, unmount } = render(
      <Shell>
        <AdminAssetsPageWrapper {...props(assets)} />
      </Shell>
    );

    const header = screen.getByRole('region', { name: 'Page header' });
    expect(header.querySelector('button')).not.toBeNull();
    expect(screen.getAllByText('Signal Bloom').length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
    unmount();
  });

  it('keeps the empty table axe-clean', async () => {
    seed([]);
    const { container } = render(
      <Shell>
        <AdminAssetsPageWrapper {...props([])} />
      </Shell>
    );

    expect(
      screen
        .getByRole('region', { name: 'Page header' })
        .querySelector('button')
    ).not.toBeNull();
    await expectNoA11yViolations(container);
  });
});
