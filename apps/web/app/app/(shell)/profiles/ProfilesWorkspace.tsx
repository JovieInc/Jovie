'use client';

import { Button } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  ArrowDownRight,
  ArrowUpRight,
  Cable,
  ExternalLink,
  Globe2,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { SocialIcon } from '@/components/atoms/SocialIcon';
import {
  DrawerSection,
  DrawerSurfaceCard,
  EntitySidebarShell,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PageToolbar,
  PageToolbarTabButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  filterProfileWorkspaceRows,
  formatProfileRankChange,
} from '@/lib/profile-surfaces/workspace';
import { cn } from '@/lib/utils';
import type {
  ProfilesWorkspaceData,
  ProfilesWorkspaceFilter,
  ProfileWorkspaceRow,
} from './data';

const columnHelper = createColumnHelper<ProfileWorkspaceRow>();
const FILTERS: ReadonlyArray<{
  id: ProfilesWorkspaceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'dsp', label: 'DSP' },
  { id: 'social', label: 'Social' },
  { id: 'source', label: 'Sources' },
  { id: 'connector', label: 'Connectors' },
];

function kindLabel(row: ProfileWorkspaceRow): string {
  const labels = {
    jovie: 'Jovie',
    website: 'Website',
    social: 'Social',
    dsp: 'DSP',
    authority: 'Source',
    connector: 'Connector',
  } as const;
  return labels[row.kind];
}

function SurfaceIcon({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  if (row.rowType === 'connector') {
    return <Cable className='h-4 w-4 text-tertiary-token' aria-hidden />;
  }
  if (
    row.kind === 'authority' ||
    row.kind === 'website' ||
    row.kind === 'jovie'
  ) {
    return <Globe2 className='h-4 w-4 text-tertiary-token' aria-hidden />;
  }
  return <SocialIcon platform={row.platform} className='h-4 w-4' />;
}

function MonitoringCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  if (row.rowType === 'connector') return <span>—</span>;
  const labels = {
    active: 'Active',
    paused: 'Paused',
    locked: 'Upgrade',
    unavailable: 'Unavailable',
  } as const;
  return (
    <span className='inline-flex min-w-18 items-center gap-1.5 text-xs text-secondary-token'>
      {row.monitoringState === 'locked' ? (
        <LockKeyhole className='h-3 w-3' aria-hidden />
      ) : (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            row.monitoringState === 'active' ? 'bg-success' : 'bg-disabled'
          )}
        />
      )}
      {labels[row.monitoringState]}
    </span>
  );
}

function RankCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  if (row.rowType === 'connector') return <span>—</span>;
  if (row.monitoringState === 'locked') {
    return (
      <span className='inline-flex items-center gap-1 text-tertiary-token'>
        <LockKeyhole className='h-3 w-3' aria-hidden />—
      </span>
    );
  }
  return <span className='tabular-nums'>{row.rank ?? '—'}</span>;
}

function ProfilesRail({
  data,
  row,
  onClose,
}: Readonly<{
  data: ProfilesWorkspaceData;
  row: ProfileWorkspaceRow | null;
  onClose: () => void;
}>) {
  const rankChange =
    row?.rowType === 'surface'
      ? formatProfileRankChange(row.rank, row.previousRank)
      : '—';
  return (
    <EntitySidebarShell
      isOpen={row !== null}
      ariaLabel='Profile details'
      scrollStrategy='shell'
      headerMode='minimal'
      hideMinimalHeaderBar
      isEmpty={!row}
      emptyMessage='Select a profile to view details.'
      entityHeader={
        row ? (
          <DrawerSurfaceCard variant='flat' className='overflow-hidden'>
            <div className='relative border-b border-subtle px-3 py-3'>
              <div className='absolute right-2.5 top-2.5'>
                <DrawerHeaderActions
                  primaryActions={[]}
                  overflowActions={[]}
                  onClose={onClose}
                />
              </div>
              <div className='flex items-center gap-2.5 pr-8'>
                {data.artist.avatarUrl ? (
                  <Image
                    src={data.artist.avatarUrl}
                    alt=''
                    width={44}
                    height={44}
                    className='h-11 w-11 rounded-full object-cover'
                  />
                ) : (
                  <div className='flex h-11 w-11 items-center justify-center rounded-full border border-subtle bg-surface-0'>
                    <SurfaceIcon row={row} />
                  </div>
                )}
                <div className='min-w-0'>
                  <div className='truncate text-sm font-semibold text-primary-token'>
                    {data.artist.name}
                  </div>
                  <div className='mt-0.5 flex items-center gap-1.5 text-xs text-tertiary-token'>
                    <SurfaceIcon row={row} />
                    <span>{row.label}</span>
                  </div>
                </div>
              </div>
              <div className='mt-3 truncate text-xs text-tertiary-token'>
                {row.handle ?? row.url}
              </div>
            </div>
          </DrawerSurfaceCard>
        ) : undefined
      }
    >
      {row ? (
        <div className='space-y-2'>
          <DrawerSection title='Status' className='space-y-2'>
            <RailMetric
              label='Qualification'
              value={
                row.rowType === 'surface'
                  ? row.qualificationStatus
                  : row.status.replace('_', ' ')
              }
            />
            <RailMetric
              label='Google Rank'
              value={
                row.rowType === 'surface' && row.monitoringState !== 'locked'
                  ? String(row.rank ?? 'Not measured')
                  : '—'
              }
            />
            <RailMetric label='Change' value={rankChange} />
          </DrawerSection>
          {row.rowType === 'surface' && row.trackedUrl ? (
            <DrawerSection title='Tracked redirect'>
              <div className='break-all rounded-md bg-surface-0 px-2.5 py-2 text-xs text-secondary-token'>
                {row.trackedUrl}
              </div>
            </DrawerSection>
          ) : null}
          <DrawerSection title='Profile health'>
            <p className='text-xs leading-5 text-secondary-token'>
              {row.primaryIssue}
            </p>
          </DrawerSection>
          <div className='grid grid-cols-2 gap-2 px-1'>
            <Button asChild variant='secondary' size='sm'>
              <Link href={row.url} target='_blank' rel='noreferrer'>
                <ExternalLink className='h-3.5 w-3.5' /> Open
              </Link>
            </Button>
            <Button asChild size='sm'>
              <Link
                href={
                  row.rowType === 'surface' && row.primaryAction === 'upgrade'
                    ? APP_ROUTES.SETTINGS_BILLING
                    : APP_ROUTES.SETTINGS_ARTIST_PROFILE
                }
              >
                {row.rowType === 'surface' && row.primaryAction === 'upgrade'
                  ? 'Upgrade'
                  : 'Review'}
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </EntitySidebarShell>
  );
}

function RailMetric({
  label,
  value,
}: Readonly<{ label: string; value: string }>) {
  return (
    <div className='flex items-center justify-between text-xs'>
      <span className='text-tertiary-token'>{label}</span>
      <span className='max-w-36 truncate capitalize text-primary-token'>
        {value}
      </span>
    </div>
  );
}

export function ProfilesWorkspace({
  data,
}: Readonly<{ data: ProfilesWorkspaceData | null }>) {
  const [filter, setFilter] = useState<ProfilesWorkspaceFilter>('all');
  const [selected, setSelected] = useState<ProfileWorkspaceRow | null>(null);
  const rows = useMemo(
    () => filterProfileWorkspaceRows(data?.rows ?? [], filter),
    [data?.rows, filter]
  );
  const columns = useMemo(
    () => [
      columnHelper.accessor('label', {
        header: 'Profile',
        size: 9999,
        minSize: 180,
        cell: context => {
          const row = context.row.original;
          return (
            <div className='flex min-w-0 items-center gap-2.5'>
              <div className='flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-0'>
                <SurfaceIcon row={row} />
              </div>
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium text-primary-token'>
                  {row.label}
                </div>
                <div className='truncate text-xs text-tertiary-token'>
                  {row.handle ?? row.url}
                </div>
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'type',
        header: 'Type',
        size: 90,
        cell: context => kindLabel(context.row.original),
      }),
      columnHelper.accessor('primaryIssue', {
        header: 'Primary Issue',
        size: 160,
      }),
      columnHelper.display({
        id: 'rank',
        header: 'Rank',
        size: 72,
        cell: context => <RankCell row={context.row.original} />,
      }),
      columnHelper.display({
        id: 'change',
        header: 'Change',
        size: 78,
        cell: context => {
          const row = context.row.original;
          if (row.rowType === 'connector') return '—';
          const change = formatProfileRankChange(row.rank, row.previousRank);
          return (
            <span
              className={cn(
                'inline-flex items-center gap-1 tabular-nums',
                change.startsWith('+') && 'text-success',
                change.startsWith('-') && 'text-error'
              )}
            >
              {change.startsWith('+') ? (
                <ArrowUpRight className='h-3 w-3' />
              ) : null}
              {change.startsWith('-') ? (
                <ArrowDownRight className='h-3 w-3' />
              ) : null}
              {change}
            </span>
          );
        },
      }),
      columnHelper.display({
        id: 'monitoring',
        header: 'Monitoring',
        size: 112,
        cell: context => <MonitoringCell row={context.row.original} />,
      }),
    ],
    []
  );

  useRegisterRightPanel(
    data && selected ? (
      <ProfilesRail
        data={data}
        row={selected}
        onClose={() => setSelected(null)}
      />
    ) : null
  );

  if (!data) {
    return (
      <PageShell>
        <TableEmptyState
          title='No artist profile selected'
          description='Select or claim an artist profile to monitor its presence.'
        />
      </PageShell>
    );
  }

  const limitLabel =
    data.monitoringLimit === null
      ? `${data.monitoredCount} monitored`
      : `${data.monitoredCount} of ${data.monitoringLimit} monitored`;
  return (
    <PageShell
      surfaceMode='table'
      toolbar={
        <PageToolbar
          start={FILTERS.map(option => (
            <PageToolbarTabButton
              key={option.id}
              label={option.label}
              active={filter === option.id}
              onClick={() => setFilter(option.id)}
            />
          ))}
          end={
            <div className='flex items-center gap-3 whitespace-nowrap text-xs text-tertiary-token'>
              <span>{limitLabel}</span>
              <span>
                Qualified{' '}
                {data.qualifiedShare === null
                  ? '—'
                  : `${Math.round(data.qualifiedShare * 100)}%`}
              </span>
              <span>Best Jovie #{data.bestJovieRank ?? '—'}</span>
              <span className='inline-flex items-center gap-1'>
                <RefreshCw className='h-3 w-3' aria-hidden />
                {data.providerAvailable ? 'Daily' : 'Monitoring paused'}
              </span>
            </div>
          }
        />
      }
    >
      <UnifiedTable
        data={rows}
        columns={columns as ColumnDef<ProfileWorkspaceRow, unknown>[]}
        getRowId={row => row.id}
        onRowClick={setSelected}
        rowHeight={56}
        minWidth='700px'
        getRowClassName={row =>
          cn(
            'cursor-pointer',
            selected?.id === row.id &&
              'bg-[color-mix(in_oklab,var(--color-accent)_8%,transparent)] ring-1 ring-inset ring-(--color-accent)'
          )
        }
        emptyState={
          <TableEmptyState
            title='No profiles in this category'
            description='Try another filter.'
          />
        }
      />
    </PageShell>
  );
}
