import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAssetRow } from '@/lib/admin/types';
import { AdminAssetsTable } from './AdminAssetsTable';

const { mockUseAdminAssetsInfiniteQuery, mockSetFilters } = vi.hoisted(() => ({
  mockUseAdminAssetsInfiniteQuery: vi.fn(),
  mockSetFilters: vi.fn(),
}));

vi.mock('nuqs', () => ({
  parseAsString: {},
  parseAsStringLiteral: () => ({ withDefault: (value: unknown) => value }),
  useQueryStates: () => [{}, mockSetFilters],
}));

vi.mock('@/lib/queries', () => ({
  useAdminAssetsInfiniteQuery: mockUseAdminAssetsInfiniteQuery,
}));

vi.mock('@/components/organisms/table', () => ({
  PAGE_TOOLBAR_END_GROUP_CLASS: '',
  PAGE_TOOLBAR_META_TEXT_CLASS: '',
  TableEmptyState: ({ heading }: { readonly heading: string }) => (
    <p>{heading}</p>
  ),
  TableSearchBar: ({ placeholder }: { readonly placeholder: string }) => (
    <input aria-label={placeholder} />
  ),
}));

vi.mock('@/features/admin/table/AdminDataTable', () => ({
  AdminDataTable: ({
    data,
    emptyState,
  }: {
    readonly data: AdminAssetRow[];
    readonly emptyState?: ReactNode;
  }) => (
    <div data-testid='admin-data-table'>
      {data.length === 0
        ? emptyState
        : data.map(row => (
            <div key={`${row.assetType}:${row.id}`}>{row.title}</div>
          ))}
    </div>
  ),
}));

vi.mock('@/features/admin/table/AdminTableHeader', () => ({
  AdminTableSubheader: ({ children }: { readonly children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/features/admin/table/AdminTableShell', () => ({
  AdminTableShell: ({
    children,
    toolbar,
  }: {
    readonly children: (props: {
      readonly headerElevated: boolean;
      readonly stickyTopPx: number;
    }) => ReactNode;
    readonly toolbar?: ReactNode;
  }) => (
    <section>
      {toolbar}
      {children({ headerElevated: false, stickyTopPx: 0 })}
    </section>
  ),
}));

const asset: AdminAssetRow = {
  id: 'asset-1',
  assetType: 'release',
  title: 'First Light',
  subtitle: 'Single · 2026',
  href: null,
  thumbnailUrl: null,
  status: 'active',
  sourceType: 'manual',
  isExplicit: false,
  issues: ['No artwork'],
  createdAt: new Date('2026-08-22T00:00:00.000Z'),
  ownerUsername: 'alpha',
  ownerDisplayName: 'Alpha Artist',
  ownerAvatarUrl: null,
  ownerUserId: 'user-alpha',
  ownerIsVerified: true,
};

const props = {
  assets: [asset],
  pageSize: 20,
  total: 1,
  search: '',
  sort: 'created_desc' as const,
  type: 'all' as const,
  issues: 'all' as const,
  verified: 'all' as const,
};

describe('AdminAssetsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminAssetsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [asset], total: 1 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('renders asset rows and the result count', () => {
    render(<AdminAssetsTable {...props} />);
    expect(screen.getByTestId('admin-data-table')).toHaveTextContent(
      'First Light'
    );
    expect(screen.getByText('1 asset')).toBeInTheDocument();
  });

  it('renders an empty state when no assets match', () => {
    mockUseAdminAssetsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [], total: 0 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    render(<AdminAssetsTable {...props} assets={[]} total={0} />);
    expect(
      screen.getByText('No assets match these filters')
    ).toBeInTheDocument();
  });
});
