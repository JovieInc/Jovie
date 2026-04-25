'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  AlertTriangle,
  ExternalLink,
  Image as ImageIcon,
  Link2Off,
  Music,
  Tag,
  User,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  createMultiFieldFilterFn,
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import type { AdminReleaseRow } from '@/lib/admin/types';
import { TABLE_MIN_WIDTHS } from '@/lib/constants/layout';
import {
  type AdminReleasesSort,
  useAdminReleasesInfiniteQuery,
} from '@/lib/queries';
import { cn } from '@/lib/utils';

interface AdminReleasesTableProps {
  readonly releases: AdminReleaseRow[];
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminReleasesSort;
  readonly clientFilter?: string;
}

const columnHelper = createColumnHelper<AdminReleaseRow>();

const RELEASE_TYPE_VARIANTS: Record<string, string> = {
  single: 'bg-secondary-token/10 text-secondary-token',
  album: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ep: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  compilation: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const SOURCE_TYPE_VARIANTS: Record<string, string> = {
  manual: 'bg-secondary-token/10 text-secondary-token',
  admin: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ingested: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

function ReleaseTypeBadge({ type }: { readonly type: string }) {
  const variant =
    RELEASE_TYPE_VARIANTS[type] ??
    'bg-secondary-token/10 text-secondary-token border border-secondary-token/20';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-medium capitalize',
        variant
      )}
    >
      {type}
    </span>
  );
}

function SourceTypeBadge({ type }: { readonly type: string }) {
  const variant =
    SOURCE_TYPE_VARIANTS[type] ?? 'bg-secondary-token/10 text-secondary-token';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-medium capitalize',
        variant
      )}
    >
      {type}
    </span>
  );
}

function IssuesPills({ row }: { readonly row: AdminReleaseRow }) {
  const issues: Array<{ label: string; icon: React.ReactNode }> = [];

  if (row.missingArtwork) {
    issues.push({
      label: 'No artwork',
      icon: <ImageIcon className='size-2.5' />,
    });
  }
  if (row.noProviders) {
    issues.push({
      label: 'No providers',
      icon: <Link2Off className='size-2.5' />,
    });
  }
  if (row.noUpc) {
    issues.push({ label: 'No UPC', icon: <Tag className='size-2.5' /> });
  }
  if (row.zeroTracks) {
    issues.push({
      label: '0 tracks',
      icon: <Music className='size-2.5' />,
    });
  }

  if (issues.length === 0) {
    return <span className='text-2xs text-tertiary-token'>—</span>;
  }

  return (
    <div className='flex flex-wrap gap-1'>
      {issues.map(issue => (
        <span
          key={issue.label}
          className='inline-flex items-center gap-0.5 rounded-full bg-red-500/10 px-1.5 py-0.5 text-3xs font-medium text-red-600 dark:text-red-400'
          title={issue.label}
        >
          {issue.icon}
          {issue.label}
        </span>
      ))}
    </div>
  );
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function createColumns(): ColumnDef<AdminReleaseRow, unknown>[] {
  return [
    columnHelper.display({
      id: 'release',
      header: 'Release',
      size: 280,
      cell: ({ row }) => {
        const release = row.original;
        return (
          <div className='flex items-center gap-3'>
            <div className='relative size-9 shrink-0 overflow-hidden rounded-md bg-secondary-token/10'>
              {release.artworkUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin table thumbnail, no optimization needed
                <img
                  src={release.artworkUrl}
                  alt=''
                  className='size-full object-cover'
                  loading='lazy'
                />
              ) : (
                <div className='flex size-full items-center justify-center text-amber-500'>
                  <Music className='size-4' />
                </div>
              )}
            </div>
            <div className='min-w-0'>
              <p className='truncate text-app font-medium text-primary-token'>
                {release.title}
              </p>
              <ReleaseTypeBadge type={release.releaseType} />
            </div>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'issues',
      header: 'Issues',
      size: 160,
      cell: ({ row }) => <IssuesPills row={row.original} />,
    }),
    columnHelper.display({
      id: 'artist',
      header: 'Artist',
      size: 200,
      cell: ({ row }) => {
        const release = row.original;
        return (
          <div className='flex items-center gap-2'>
            <Avatar className='size-6'>
              {release.artistAvatarUrl ? (
                <AvatarImage src={release.artistAvatarUrl} alt='' />
              ) : null}
              <AvatarFallback className='text-3xs'>
                <User className='size-3' />
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <p className='truncate text-xs font-medium text-primary-token'>
                @{release.artistUsername}
              </p>
              {release.artistDisplayName ? (
                <p className='truncate text-2xs text-tertiary-token'>
                  {release.artistDisplayName}
                </p>
              ) : null}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('providerCount', {
      header: 'Providers',
      size: 90,
      cell: ({ getValue }) => {
        const count = getValue();
        if (count === 0) {
          return (
            <span className='inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-0.5 text-2xs font-medium text-red-600 dark:text-red-400'>
              0
            </span>
          );
        }
        return <span className='text-xs text-secondary-token'>{count}</span>;
      },
    }),
    columnHelper.accessor('sourceType', {
      header: 'Source',
      size: 90,
      cell: ({ getValue }) => <SourceTypeBadge type={getValue()} />,
    }),
    columnHelper.accessor('releaseDate', {
      header: 'Released',
      size: 110,
      cell: ({ getValue }) => (
        <span className='text-xs text-secondary-token'>
          {formatDate(getValue())}
        </span>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Ingested',
      size: 110,
      cell: ({ getValue }) => (
        <span className='text-xs text-secondary-token'>
          {formatDate(getValue())}
        </span>
      ),
    }),
  ] as ColumnDef<AdminReleaseRow, unknown>[];
}

function getContextMenuItems(release: AdminReleaseRow) {
  const items = [
    {
      id: 'view-release',
      label: 'View on Jovie',
      icon: <ExternalLink className='size-3.5' />,
      onClick: () => {
        globalThis.open(`/${release.artistUsername}/${release.slug}`, '_blank');
      },
    },
    {
      id: 'view-profile',
      label: 'View profile',
      icon: <User className='size-3.5' />,
      onClick: () => {
        globalThis.open(
          `${APP_ROUTES.ADMIN_CREATORS}?q=${encodeURIComponent(release.artistUsername)}`,
          '_blank'
        );
      },
    },
  ];

  if (release.artistUserId) {
    items.push({
      id: 'impersonate',
      label: 'Impersonate',
      icon: <AlertTriangle className='size-3.5' />,
      onClick: () => {
        globalThis.open(
          `/api/admin/impersonate?userId=${release.artistUserId}`,
          '_blank'
        );
      },
    });
  }

  return items;
}

// Client-side filter searches across title, artist handle, display name, UPC
const releaseFilterFn = createMultiFieldFilterFn<AdminReleaseRow>([
  r => r.title,
  r => r.artistUsername,
  r => r.artistDisplayName,
  r => r.upc,
  r => r.label,
]);

export function AdminReleasesTableUnified({
  releases: initialReleases,
  pageSize,
  total,
  search,
  sort,
  clientFilter,
}: Readonly<AdminReleasesTableProps>) {
  // Load all data without server-side search — filter client-side instead
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminReleasesInfiniteQuery({
      sort,
      search: '',
      pageSize,
      initialData: { rows: initialReleases, total },
    });

  const allReleases = useMemo(
    () => data?.pages.flatMap(page => page.rows) ?? initialReleases,
    [data?.pages, initialReleases]
  );

  const columns = useMemo(() => createColumns(), []);

  const emptyState = clientFilter ? (
    <TableEmptyState
      title={`No releases match '${clientFilter}'`}
      description='Try a different search.'
    />
  ) : (
    <TableEmptyState
      title='No releases found on the platform'
      description='Releases will appear here once artists add them.'
    />
  );

  return (
    <AdminTableShell
      toolbar={
        <AdminTableSubheader>
          <div className={PAGE_TOOLBAR_META_TEXT_CLASS}>
            {total.toLocaleString()} release{total === 1 ? '' : 's'}
          </div>
          <div className={PAGE_TOOLBAR_END_GROUP_CLASS} />
        </AdminTableSubheader>
      }
    >
      {() => (
        <UnifiedTable
          data={allReleases}
          columns={columns}
          getRowId={(row: AdminReleaseRow) => row.id}
          minWidth={`${TABLE_MIN_WIDTHS.MEDIUM}px`}
          emptyState={emptyState}
          globalFilter={clientFilter ?? ''}
          enableFiltering={clientFilter !== undefined}
          globalFilterFn={releaseFilterFn}
          getContextMenuItems={(row: AdminReleaseRow) =>
            getContextMenuItems(row)
          }
          hasNextPage={hasNextPage ?? false}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      )}
    </AdminTableShell>
  );
}
