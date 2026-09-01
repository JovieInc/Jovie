import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReleaseRow } from '@/lib/admin/types';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

const { mockUseAdminReleasesInfiniteQuery } = vi.hoisted(() => ({
  mockUseAdminReleasesInfiniteQuery: vi.fn(),
}));

vi.mock('@/components/molecules/Avatar', () => ({
  Avatar: ({
    alt,
    className,
    name,
    size,
    src,
  }: {
    readonly alt?: string;
    readonly className?: string;
    readonly name?: string | null;
    readonly size?: string;
    readonly src?: string | null;
  }) => (
    <span
      data-testid='admin-release-artist-avatar'
      data-avatar-alt={alt ?? ''}
      data-avatar-class={className ?? ''}
      data-avatar-name={name ?? ''}
      data-avatar-size={size ?? ''}
      data-avatar-src={src ?? ''}
    />
  ),
}));

vi.mock('@/components/organisms/table', () => ({
  createMultiFieldFilterFn: () => () => true,
  PAGE_TOOLBAR_END_GROUP_CLASS: '',
  PAGE_TOOLBAR_META_TEXT_CLASS: '',
  TableEmptyState: ({
    description,
    heading,
  }: {
    readonly description: string;
    readonly heading: string;
  }) => (
    <div>
      <p>{heading}</p>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock('@/features/admin/table/AdminDataTable', () => ({
  AdminDataTable: ({
    columns,
    data,
    getRowId,
  }: {
    readonly columns: Array<{
      readonly cell?: (context: {
        readonly row: { readonly original: AdminReleaseRow };
      }) => ReactNode;
      readonly id?: string;
    }>;
    readonly data: AdminReleaseRow[];
    readonly getRowId: (row: AdminReleaseRow) => string;
  }) => {
    const artistColumn = columns.find(column => column.id === 'artist');
    return (
      <div data-testid='admin-data-table'>
        {data.map(row => (
          <div key={getRowId(row)}>
            {artistColumn?.cell?.({ row: { original: row } })}
          </div>
        ))}
      </div>
    );
  },
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

vi.mock('@/lib/queries', () => ({
  useAdminReleasesInfiniteQuery: mockUseAdminReleasesInfiniteQuery,
}));

const release: AdminReleaseRow = {
  id: 'release-1',
  title: 'First Light',
  slug: 'first-light',
  releaseType: 'single',
  releaseDate: new Date('2026-08-21T00:00:00.000Z'),
  artworkUrl: null,
  totalTracks: 1,
  isExplicit: false,
  label: 'Signal Works',
  upc: '123456789012',
  sourceType: 'manual',
  spotifyPopularity: 42,
  createdAt: new Date('2026-08-22T00:00:00.000Z'),
  creatorProfileId: 'profile-alpha',
  artistUsername: 'alpha',
  artistDisplayName: 'Alpha Artist',
  artistAvatarUrl: null,
  artistUserId: 'user-alpha',
  providerCount: 3,
  missingArtwork: false,
  noProviders: false,
  noUpc: false,
  zeroTracks: false,
};

describe('AdminReleasesTableUnified artist identity rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAdminReleasesInfiniteQuery.mockReturnValue({
      data: {
        pages: [{ rows: [release], total: 1 }],
      },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it('uses the app Avatar contract for artist fallback identity', () => {
    render(
      <AdminReleasesTableUnified
        releases={[release]}
        pageSize={20}
        total={1}
        search=''
        sort='release_date_desc'
      />
    );

    const avatar = screen.getByTestId('admin-release-artist-avatar');

    expect(avatar).toHaveAttribute('data-avatar-size', 'md');
    expect(avatar).toHaveAttribute('data-avatar-name', 'Alpha Artist');
    expect(avatar).toHaveAttribute('data-avatar-src', '');
    expect(avatar.className).not.toMatch(/\b(?:size|h|w)-/);
    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('Alpha Artist')).toBeInTheDocument();
  });
});
