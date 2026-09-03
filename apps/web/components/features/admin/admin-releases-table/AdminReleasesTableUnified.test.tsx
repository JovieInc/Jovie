import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminReleaseRow } from '@/lib/admin/types';
import { AdminReleasesTableUnified } from './AdminReleasesTableUnified';

const { mockUseAdminReleasesInfiniteQuery } = vi.hoisted(() => ({
  mockUseAdminReleasesInfiniteQuery: vi.fn(),
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

  it('renders artist identity with the canonical ui Avatar composite and fallback glyph', () => {
    const { container } = render(
      <AdminReleasesTableUnified
        releases={[release]}
        pageSize={20}
        total={1}
        search=''
        sort='release_date_desc'
      />
    );

    // The row composes the @jovie/ui Avatar atoms (person shape, md size by
    // contract) — wrapper sizing classes (size-/h-/w-) are banned by the
    // Avatar contract ratchet, so the caller passes the size prop instead.
    const avatarRoot = container.querySelector("span[data-shape='person']");
    expect(avatarRoot).not.toBeNull();
    expect(avatarRoot).toHaveAttribute('data-size', 'md');
    expect(avatarRoot).toHaveAttribute('data-shape', 'person');
    expect(avatarRoot).toHaveStyle({ width: '24px', height: '24px' });
    expect(avatarRoot?.className).not.toMatch(/\b(?:size|h|w)-/);

    // No artwork URL -> no <img>; fallback renders the identity glyph.
    expect(container.querySelector('img')).toBeNull();
    expect(avatarRoot?.querySelector('svg')).not.toBeNull();

    expect(screen.getByText('@alpha')).toBeInTheDocument();
    expect(screen.getByText('Alpha Artist')).toBeInTheDocument();
  });

  it('renders the artist avatar image when an artwork URL exists', () => {
    const withAvatar: AdminReleaseRow = {
      ...release,
      artistAvatarUrl: 'https://cdn.jov.ie/alpha.jpg',
    };
    // The table renders from the query payload, so seed the mock with the
    // avatar-bearing row before rendering.
    mockUseAdminReleasesInfiniteQuery.mockReturnValue({
      data: { pages: [{ rows: [withAvatar], total: 1 }] },
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    });

    const { container } = render(
      <AdminReleasesTableUnified
        releases={[withAvatar]}
        pageSize={20}
        total={1}
        search=''
        sort='release_date_desc'
      />
    );

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute('src', 'https://cdn.jov.ie/alpha.jpg');
    expect(image).toHaveAttribute('alt', '');
  });
});
