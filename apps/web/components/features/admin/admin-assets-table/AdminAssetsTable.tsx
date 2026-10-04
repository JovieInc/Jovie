'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@jovie/ui';
import {
  AlertTriangle,
  BadgeCheck,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  ListMusic,
  Music,
  User,
} from 'lucide-react';
import { parseAsString, parseAsStringLiteral, useQueryStates } from 'nuqs';
import { useMemo } from 'react';
import {
  PAGE_TOOLBAR_END_GROUP_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  TableEmptyState,
  TableSearchBar,
} from '@/components/organisms/table';
import { TABLE_CELL_MULTILINE_CONTENT_CLASSNAME } from '@/components/organisms/table/atoms/TableCell';
import { TableIssueSummary } from '@/components/organisms/table/molecules/TableIssueSummary';
import { APP_ROUTES } from '@/constants/routes';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import type {
  AdminAssetRow,
  AdminAssetSort,
  AdminAssetType,
} from '@/lib/admin/types';
import {
  adminAssetIssuesFilters,
  adminAssetTypes,
  adminAssetVerifiedFilters,
} from '@/lib/nuqs';
import { useAdminAssetsInfiniteQuery } from '@/lib/queries';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';

interface AdminAssetsTableProps {
  readonly assets: AdminAssetRow[];
  readonly pageSize: number;
  readonly total: number;
  readonly search: string;
  readonly sort: AdminAssetSort;
  readonly type: AdminAssetType | 'all';
  readonly issues: 'all' | 'issues';
  readonly verified: 'all' | 'verified' | 'unverified';
}

const columnHelper = createColumnHelper<AdminAssetRow>();

const ASSET_TYPE_LABELS: Record<AdminAssetType, string> = {
  release: 'Release',
  track: 'Track',
  link: 'Link',
  photo: 'Media',
};

const ASSET_TYPE_VARIANTS: Record<AdminAssetType, string> = {
  release: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  track: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  link: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  photo: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
};

const ASSET_TYPE_ICONS: Record<AdminAssetType, typeof Music> = {
  release: Music,
  track: ListMusic,
  link: Link2,
  photo: ImageIcon,
};

function AssetTypeBadge({ type }: { readonly type: AdminAssetType }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-3xs font-medium',
        ASSET_TYPE_VARIANTS[type]
      )}
    >
      {ASSET_TYPE_LABELS[type]}
    </span>
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

function createColumns(): ColumnDef<AdminAssetRow, unknown>[] {
  return [
    columnHelper.display({
      id: 'asset',
      meta: { cellContentClassName: TABLE_CELL_MULTILINE_CONTENT_CLASSNAME },
      header: 'Asset',
      size: 300,
      cell: ({ row }) => {
        const asset = row.original;
        const Icon = ASSET_TYPE_ICONS[asset.assetType];
        return (
          <div className='flex min-h-10 items-center gap-3'>
            <div className='relative h-9 w-9 max-h-9 max-w-9 shrink-0 overflow-hidden rounded-md bg-secondary-token/10'>
              {asset.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin table thumbnail, no optimization needed
                <img
                  src={asset.thumbnailUrl}
                  alt=''
                  className='block h-9 w-9 max-h-9 max-w-9 object-cover'
                  loading='lazy'
                />
              ) : (
                <div className='flex size-full items-center justify-center text-tertiary-token'>
                  <Icon className='size-4' />
                </div>
              )}
            </div>
            <div className='min-w-0'>
              <div className='flex items-center gap-1.5'>
                <p className='truncate text-app font-medium text-primary-token'>
                  {asset.title}
                </p>
                {asset.isExplicit ? (
                  <span className='inline-flex items-center rounded bg-secondary-token/10 px-1 text-3xs font-semibold text-secondary-token'>
                    E
                  </span>
                ) : null}
              </div>
              <div className='flex items-center gap-1.5'>
                <AssetTypeBadge type={asset.assetType} />
                {asset.subtitle ? (
                  <span className='truncate text-2xs text-tertiary-token'>
                    {asset.subtitle}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'issues',
      meta: { cellContentClassName: TABLE_CELL_MULTILINE_CONTENT_CLASSNAME },
      header: 'Issues',
      size: 180,
      cell: ({ row }) => (
        <TableIssueSummary
          issues={row.original.issues.map(label => ({ label }))}
        />
      ),
    }),
    columnHelper.display({
      id: 'owner',
      meta: { cellContentClassName: TABLE_CELL_MULTILINE_CONTENT_CLASSNAME },
      header: 'Owner',
      size: 200,
      cell: ({ row }) => {
        const asset = row.original;
        if (!asset.ownerUsername) {
          return <span className='text-2xs text-tertiary-token'>No owner</span>;
        }
        return (
          <div className='flex items-center gap-2'>
            <Avatar size='md'>
              {asset.ownerAvatarUrl ? (
                <AvatarImage src={asset.ownerAvatarUrl} alt='' />
              ) : null}
              <AvatarFallback>
                <User className='size-3' />
              </AvatarFallback>
            </Avatar>
            <div className='min-w-0'>
              <div className='flex items-center gap-1'>
                <p className='truncate text-xs font-medium text-primary-token'>
                  @{asset.ownerUsername}
                </p>
                {asset.ownerIsVerified ? (
                  <BadgeCheck className='size-3 shrink-0 text-blue-500' />
                ) : null}
              </div>
              {asset.ownerDisplayName ? (
                <p className='truncate text-2xs text-tertiary-token'>
                  {asset.ownerDisplayName}
                </p>
              ) : null}
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      size: 100,
      cell: ({ getValue }) => (
        <span className='inline-flex items-center rounded-full bg-secondary-token/10 px-1.5 py-0.5 text-3xs font-medium capitalize text-secondary-token'>
          {getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('sourceType', {
      header: 'Source',
      size: 90,
      cell: ({ getValue }) => (
        <span className='inline-flex items-center rounded-full bg-secondary-token/10 px-1.5 py-0.5 text-3xs font-medium capitalize text-secondary-token'>
          {getValue()}
        </span>
      ),
    }),
    columnHelper.accessor('createdAt', {
      header: 'Created',
      size: 110,
      cell: ({ getValue }) => (
        <span className='text-xs text-secondary-token'>
          {formatDate(getValue())}
        </span>
      ),
    }),
  ] as ColumnDef<AdminAssetRow, unknown>[];
}

function getContextMenuItems(asset: AdminAssetRow) {
  const items = [];

  if (asset.href) {
    items.push({
      id: 'view-asset',
      label: 'Open Asset',
      icon: <ExternalLink className='size-3.5' />,
      onClick: () => {
        globalThis.open(asset.href ?? '', '_blank');
      },
    });
  }

  if (asset.ownerUsername) {
    items.push({
      id: 'view-profile',
      label: 'View Profile',
      icon: <User className='size-3.5' />,
      onClick: () => {
        globalThis.open(
          `${APP_ROUTES.ADMIN_CREATORS}?q=${encodeURIComponent(asset.ownerUsername ?? '')}`,
          '_blank'
        );
      },
    });
  }

  if (asset.ownerUserId) {
    items.push({
      id: 'impersonate',
      label: 'Impersonate',
      icon: <AlertTriangle className='size-3.5' />,
      onClick: () => {
        globalThis.open(
          `/api/admin/impersonate?userId=${asset.ownerUserId}`,
          '_blank'
        );
      },
    });
  }

  return items;
}

export function AdminAssetsTable({
  assets: initialAssets,
  pageSize,
  total,
  search,
  sort,
  type,
  issues,
  verified,
}: Readonly<AdminAssetsTableProps>) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAdminAssetsInfiniteQuery({
      sort,
      search,
      type,
      issues,
      verified,
      pageSize,
      initialData: { rows: initialAssets, total },
    });

  // Filter changes write to the URL (shallow: false → server re-render).
  const [, setFilters] = useQueryStates(
    {
      type: parseAsStringLiteral(adminAssetTypes).withDefault('all'),
      issues: parseAsStringLiteral(adminAssetIssuesFilters).withDefault('all'),
      verified: parseAsStringLiteral(adminAssetVerifiedFilters).withDefault(
        'all'
      ),
      q: parseAsString,
    },
    { shallow: false, history: 'push' }
  );

  const allAssets = useMemo(
    () => data?.pages.flatMap(page => page.rows) ?? initialAssets,
    [data?.pages, initialAssets]
  );

  const columns = useMemo(() => createColumns(), []);

  const emptyState = (
    <TableEmptyState
      heading='No assets match these filters'
      description='Releases, tracks, links, and media across every creator appear here.'
    />
  );

  return (
    <AdminTableShell
      toolbar={
        <AdminTableSubheader>
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            <TableSearchBar
              value={search}
              onChange={value => setFilters({ q: value || null })}
              placeholder='Search title, owner, URL…'
              className='w-56'
            />
            <div className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              {total.toLocaleString()} asset{total === 1 ? '' : 's'}
            </div>
          </div>
          <div className={PAGE_TOOLBAR_END_GROUP_CLASS}>
            <Select
              value={type}
              onValueChange={value =>
                setFilters({ type: value as typeof type })
              }
            >
              <SelectTrigger aria-label='Filter By Asset Type'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {adminAssetTypes.map(t => (
                  <SelectItem key={t} value={t}>
                    {t === 'all' ? 'All types' : ASSET_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={issues}
              onValueChange={value =>
                setFilters({ issues: value as typeof issues })
              }
            >
              <SelectTrigger aria-label='Filter By Data Quality'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All assets</SelectItem>
                <SelectItem value='issues'>Issues only</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={verified}
              onValueChange={value =>
                setFilters({ verified: value as typeof verified })
              }
            >
              <SelectTrigger aria-label='Filter By Owner Verification'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All owners</SelectItem>
                <SelectItem value='verified'>Verified owners</SelectItem>
                <SelectItem value='unverified'>Unverified owners</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </AdminTableSubheader>
      }
    >
      {() => (
        <AdminDataTable
          rowMode='two-line'
          data={allAssets}
          columns={columns}
          getRowId={(row: AdminAssetRow) => `${row.assetType}:${row.id}`}
          emptyState={emptyState}
          getContextMenuItems={(row: AdminAssetRow) => getContextMenuItems(row)}
          hasNextPage={hasNextPage ?? false}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      )}
    </AdminTableShell>
  );
}
