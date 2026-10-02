import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminAssetRow } from '@/lib/admin/types';
import { AdminAssetsTable } from './AdminAssetsTable';
import { assets as storyAssets } from './story-fixtures';

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
  TABLE_CELL_MULTILINE_CONTENT_CLASSNAME: 'whitespace-normal',
  PAGE_TOOLBAR_END_GROUP_CLASS: '',
  PAGE_TOOLBAR_META_TEXT_CLASS: '',
  TableEmptyState: ({ heading }: { readonly heading: string }) => (
    <p>{heading}</p>
  ),
  TableSearchBar: ({
    onChange,
    placeholder,
  }: {
    readonly onChange: (value: string) => void;
    readonly placeholder: string;
  }) => (
    <input
      aria-label={placeholder}
      onChange={event => onChange(event.currentTarget.value)}
    />
  ),
}));

interface TestColumn {
  readonly meta?: { readonly cellContentClassName?: string };
  readonly id?: string;
  readonly cell?: (context: {
    readonly row: { readonly original: AdminAssetRow };
    readonly getValue?: () => unknown;
  }) => ReactNode;
}

vi.mock('@/features/admin/table/AdminDataTable', () => ({
  AdminDataTable: ({
    columns,
    data,
    emptyState,
    getContextMenuItems,
  }: {
    readonly columns: TestColumn[];
    readonly data: AdminAssetRow[];
    readonly emptyState?: ReactNode;
    readonly getContextMenuItems?: (row: AdminAssetRow) => {
      readonly id: string;
      readonly label: string;
      readonly onClick: () => void;
    }[];
  }) => (
    <div
      data-testid='admin-data-table'
      data-multiline-columns={columns
        .filter(column =>
          column.meta?.cellContentClassName?.includes('whitespace-normal')
        )
        .map(column => column.id)
        .join(',')}
    >
      {data.length === 0
        ? emptyState
        : data.map(row => (
            <div key={`${row.assetType}:${row.id}`}>
              {columns.map((column, columnIndex) => (
                <span key={column.id ?? columnIndex}>
                  {column.cell?.({
                    row: { original: row },
                    getValue: () =>
                      column.id ? row[column.id as keyof AdminAssetRow] : null,
                  })}
                </span>
              ))}
              {getContextMenuItems?.(row).map(item => (
                <button type='button' key={item.id} onClick={item.onClick}>
                  {item.label}
                </button>
              ))}
            </div>
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

vi.mock('@jovie/ui', async importOriginal => {
  const actual = await importOriginal<typeof import('@jovie/ui')>();
  return {
    ...actual,
    Select: ({
      onValueChange,
    }: {
      readonly onValueChange: (value: string) => void;
    }) => (
      <button type='button' onClick={() => onValueChange('release')}>
        select
      </button>
    ),
    SelectTrigger: () => null,
    SelectValue: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
  };
});

const asset = (overrides: Partial<AdminAssetRow> = {}): AdminAssetRow => ({
  id: 'asset-1',
  assetType: 'release',
  title: 'First Light',
  subtitle: 'Single · 2026',
  href: 'https://jovie.local/r/first-light',
  thumbnailUrl: 'https://img.example.com/art.png',
  status: 'active',
  sourceType: 'manual',
  isExplicit: true,
  issues: ['No artwork'],
  createdAt: new Date('2026-08-22T00:00:00.000Z'),
  ownerUsername: 'alpha',
  ownerDisplayName: 'Alpha Artist',
  ownerAvatarUrl: 'https://img.example.com/av.png',
  ownerUserId: 'user-alpha',
  ownerIsVerified: true,
  ...overrides,
});

const orphanLink = asset({
  id: 'asset-2',
  assetType: 'link',
  title: 'Spotify',
  subtitle: null,
  thumbnailUrl: null,
  isExplicit: false,
  issues: [],
  createdAt: '2026-08-01T00:00:00.000Z' as unknown as Date,
  ownerUsername: null,
  ownerDisplayName: null,
  ownerAvatarUrl: null,
  ownerUserId: null,
  ownerIsVerified: false,
});

const baseProps = {
  assets: [asset(), orphanLink],
  pageSize: 20,
  total: 2,
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
      data: { pages: [{ rows: baseProps.assets, total: 2 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('renders asset rows, owner identity, and context menu actions', () => {
    const openSpy = vi.spyOn(globalThis, 'open').mockImplementation(() => null);
    render(<AdminAssetsTable {...baseProps} />);
    expect(screen.getAllByText('First Light').length).toBeGreaterThan(0);
    expect(screen.getAllByText('@alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('No owner').length).toBeGreaterThan(0);
    expect(screen.getByText('2 assets')).toBeInTheDocument();
    expect(screen.getByTestId('admin-data-table')).toHaveAttribute(
      'data-multiline-columns',
      'asset,issues,owner'
    );
    screen.getAllByText('Open Asset')[0]?.click();
    expect(openSpy).toHaveBeenCalledWith(
      'https://jovie.local/r/first-light',
      '_blank'
    );
    screen.getAllByText('Impersonate')[0]?.click();
    expect(openSpy).toHaveBeenCalledWith(
      '/api/admin/impersonate?userId=user-alpha',
      '_blank'
    );
    openSpy.mockRestore();
  });

  it('writes filter changes to the URL query state', () => {
    render(<AdminAssetsTable {...baseProps} />);
    const search = screen.getByLabelText('Search title, owner, URL…');
    search.dispatchEvent(new Event('change', { bubbles: true }));
    const selects = screen.getAllByText('select');
    selects[0]?.click();
    selects[1]?.click();
    selects[2]?.click();
    expect(mockSetFilters).toHaveBeenCalled();
  });

  it('renders an empty state when no assets match', () => {
    mockUseAdminAssetsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [], total: 0 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    render(<AdminAssetsTable {...baseProps} assets={[]} total={0} />);
    expect(
      screen.getByText('No assets match these filters')
    ).toBeInTheDocument();
  });

  it('supports the story fixture row shape', () => {
    expect(storyAssets.length).toBeGreaterThan(0);
    mockUseAdminAssetsInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: storyAssets, total: storyAssets.length }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
    render(<AdminAssetsTable {...baseProps} assets={storyAssets} />);
    expect(screen.getAllByText('Signal Bloom').length).toBeGreaterThan(0);
  });

  it('renders issue flags with the error token, not raw red-* (JOV-6773)', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'components/features/admin/admin-assets-table/AdminAssetsTable.tsx'
      ),
      'utf8'
    );

    expect(source).not.toMatch(/\bred-\d/);
    expect(source).toContain('TableIssueSummary');
  });
});
