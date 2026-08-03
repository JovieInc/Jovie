'use client';

import { Button, type CommonDropdownItem, SimpleTooltip } from '@jovie/ui';
import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import {
  ArrowDownRight,
  ArrowUpRight,
  AudioWaveform,
  BookOpen,
  Cable,
  Circle,
  CircleAlert,
  CircleCheck,
  CircleX,
  ExternalLink,
  Globe2,
  LockKeyhole,
  MoreHorizontal,
  Orbit,
  Plus,
  Share2,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BrandLogo } from '@/components/atoms/BrandLogo';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import {
  getPlatformIconMetadata,
  SocialIcon,
} from '@/components/atoms/SocialIcon';
import { TableActionMenu } from '@/components/atoms/table-action-menu/TableActionMenu';
import { DashboardHeaderActionButton } from '@/components/features/dashboard/atoms/DashboardHeaderActionButton';
import { DashboardHeaderActionGroup } from '@/components/features/dashboard/atoms/DashboardHeaderActionGroup';
import {
  DrawerAnalyticsSummaryCard,
  DrawerSection,
  EntityHeaderCard,
  EntitySidebarShell,
  ShareableLinkRow,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import { EmptyState } from '@/components/molecules/EmptyState';
import { PageShell } from '@/components/organisms/PageShell';
import {
  type ContextMenuItemType,
  convertContextMenuItems,
  convertToCommonDropdownItems,
  PageToolbar,
  PageToolbarTabButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { APP_ROUTES } from '@/constants/routes';
import { useRegisterHeaderActions } from '@/contexts/HeaderActionsContext';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  filterProfileWorkspaceRows,
  formatProfileRankChange,
  getConnectionPrimaryAction,
  getConnectionStatus,
  sortProfileWorkspaceRows,
} from '@/lib/profile-surfaces/workspace';
import { cn } from '@/lib/utils';
import {
  AddConnectionRail,
  type ConnectionIntakeCandidate,
} from './AddConnectionRail';
import { buildConnectionActions } from './connection-actions';
import type {
  ProfilesWorkspaceData,
  ProfilesWorkspaceFilter,
  ProfileWorkspaceRow,
} from './data';

const columnHelper = createColumnHelper<ProfileWorkspaceRow>();
const DSP_FILTER_LABEL = 'DSPs';
const FILTERS: ReadonlyArray<{
  id: ProfilesWorkspaceFilter;
  label: string;
}> = [
  { id: 'all', label: 'All Pages' },
  { id: 'dsp', label: DSP_FILTER_LABEL },
  { id: 'social', label: 'Social' },
  { id: 'source', label: 'Sources' },
  { id: 'website', label: 'Websites' },
  { id: 'jovie', label: 'Jovie' },
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

function ConnectionTypeGlyph({
  row,
  className,
}: Readonly<{
  row: ProfileWorkspaceRow;
  className?: string;
}>) {
  const iconClassName = cn('h-4 w-4', className);
  if (row.kind === 'connector')
    return <Cable className={iconClassName} aria-hidden />;
  if (row.kind === 'website')
    return <Globe2 className={iconClassName} aria-hidden />;
  if (row.kind === 'authority')
    return <BookOpen className={iconClassName} aria-hidden />;
  if (row.kind === 'dsp')
    return <AudioWaveform className={iconClassName} aria-hidden />;
  if (row.kind === 'social')
    return <Share2 className={iconClassName} aria-hidden />;
  return <Orbit className={iconClassName} aria-hidden />;
}

function ConnectionBrandIcon({
  row,
  className,
  emphasized = false,
}: Readonly<{
  row: ProfileWorkspaceRow;
  className?: string;
  emphasized?: boolean;
}>) {
  if (row.rowType === 'connector')
    return (
      <ConnectionTypeGlyph
        row={row}
        className={cn('text-tertiary-token', className)}
      />
    );
  if (row.kind === 'authority' || row.kind === 'website') {
    return (
      <ConnectionTypeGlyph
        row={row}
        className={cn('text-tertiary-token', className)}
      />
    );
  }
  if (row.kind === 'jovie') {
    return (
      <BrandLogo
        size={20}
        tone='color'
        rounded={false}
        aria-hidden
        className={cn('[&_svg]:h-full [&_svg]:w-full', className)}
      />
    );
  }
  const metadata = getPlatformIconMetadata(row.platform);
  if (!metadata) {
    return (
      <span
        className={cn('inline-flex shrink-0 text-tertiary-token', className)}
        aria-label={row.label}
        role='img'
      >
        <SocialIcon platform={row.platform} className='h-full w-full' />
      </span>
    );
  }

  const revealClassName = emphasized
    ? 'absolute inset-0 opacity-100'
    : 'absolute inset-0 opacity-0 transition-opacity duration-fast motion-reduce:transition-none group-hover/connection-row:opacity-100 group-focus-visible/connection-row:opacity-100 group-aria-[selected=true]/connection-row:opacity-100';

  return (
    <span
      className={cn('relative inline-flex h-4 w-4 shrink-0', className)}
      aria-label={row.label}
      role='img'
    >
      <SocialIcon
        platform={row.platform}
        className='h-full w-full text-primary-token opacity-70'
      />
      <span
        className={revealClassName}
        style={{ color: `#${metadata.hex}` }}
        aria-hidden
      >
        <SocialIcon platform={row.platform} className='h-full w-full' />
      </span>
    </span>
  );
}

function connectionDisplayUrl(row: ProfileWorkspaceRow): string {
  return row.rowType === 'surface' && row.kind === 'social'
    ? (row.trackedUrl ?? row.url)
    : row.url;
}

function connectionUrlDisplay(row: ProfileWorkspaceRow): string {
  const displayUrl = connectionDisplayUrl(row);
  if (row.handle && displayUrl === row.url) return row.handle;
  try {
    const url = new URL(displayUrl);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    if (!path) return host;
    try {
      return `${host} · ${decodeURIComponent(path)}`;
    } catch {
      return `${host} · ${path}`;
    }
  } catch {
    return displayUrl;
  }
}

function ConnectionUrlDisplay({
  row,
  className,
}: Readonly<{ row: ProfileWorkspaceRow; className?: string }>) {
  const displayUrl = connectionDisplayUrl(row);
  return (
    <span className={cn('truncate', className)} title={displayUrl}>
      {connectionUrlDisplay(row)}
    </span>
  );
}

function TypeCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  const label = kindLabel(row);
  return (
    <SimpleTooltip content={`${label} profile type`}>
      <span
        role='img'
        aria-label={`${label} profile type`}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center',
          row.kind === 'jovie' ? 'text-accent' : 'text-tertiary-token'
        )}
      >
        <ConnectionTypeGlyph row={row} />
      </span>
    </SimpleTooltip>
  );
}

function StatusCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  const status = getConnectionStatus(row);
  const StatusIcon =
    status.tone === 'success'
      ? CircleCheck
      : status.tone === 'warning'
        ? CircleAlert
        : status.tone === 'error'
          ? CircleX
          : Circle;
  return (
    <SimpleTooltip content={status.label}>
      <span
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tertiary-token',
          status.tone === 'success' && 'text-success',
          status.tone === 'warning' && 'text-warning',
          status.tone === 'error' && 'text-error'
        )}
      >
        <StatusIcon className='h-3.5 w-3.5' aria-hidden />
        <span className='sr-only'>{status.label}</span>
      </span>
    </SimpleTooltip>
  );
}

const MONITORING_LABELS = {
  active: 'Active',
  paused: 'Paused',
  locked: 'Requires Upgrade',
  unavailable: 'Unavailable',
} as const;

function MonitoringCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  const monitoringState = row.monitoringState;
  return (
    <span className='inline-flex min-w-20 items-center gap-1.5 text-xs text-secondary-token'>
      {monitoringState === 'locked' ? (
        <LockKeyhole className='h-3 w-3' aria-hidden />
      ) : (
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            monitoringState === 'active' && 'bg-success',
            monitoringState === 'paused' && 'bg-warning',
            monitoringState === 'unavailable' && 'bg-disabled'
          )}
          aria-hidden
        />
      )}
      {MONITORING_LABELS[monitoringState]}
    </span>
  );
}

function RankCell({ row }: Readonly<{ row: ProfileWorkspaceRow }>) {
  if (row.rowType === 'connector') {
    return <EmptyCell tooltip='Search rank is not available for connectors.' />;
  }
  if (row.monitoringState === 'locked') {
    return (
      <SimpleTooltip content='Upgrade required to monitor this page.'>
        <span
          role='img'
          aria-label='Rank Unavailable. Upgrade Required.'
          className='inline-flex items-center gap-1 text-tertiary-token'
        >
          <LockKeyhole className='h-3 w-3' aria-hidden />
          <span>—</span>
        </span>
      </SimpleTooltip>
    );
  }
  if (row.rank === null) {
    return <EmptyCell tooltip='No rank has been measured yet.' />;
  }
  return <span className='tabular-nums'>{row.rank}</span>;
}

function ConnectionRail({
  data,
  row,
  onClose,
  contextMenuItems,
}: Readonly<{
  data: ProfilesWorkspaceData;
  row: ProfileWorkspaceRow | null;
  onClose: () => void;
  contextMenuItems: CommonDropdownItem[];
}>) {
  const primaryAction = row ? getConnectionPrimaryAction(row) : null;
  const rankChange =
    row?.rowType === 'surface'
      ? formatProfileRankChange(row.rank, row.previousRank)
      : '—';
  return (
    <EntitySidebarShell
      isOpen={row !== null}
      ariaLabel='Presence details'
      contextMenuItems={contextMenuItems}
      scrollStrategy='shell'
      workspaceSurface='raised'
      headerMode='minimal'
      hideMinimalHeaderBar
      isEmpty={!row}
      emptyMessage='Select a profile or page to view details.'
      entityHeader={
        row ? (
          <EntityHeaderCard
            image={
              <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-0'>
                <ConnectionBrandIcon row={row} className='h-6 w-6' emphasized />
              </div>
            }
            title={row.label}
            subtitle={
              <span className='flex min-w-0 items-center gap-1.5'>
                <ConnectionTypeGlyph row={row} className='h-3 w-3' />
                <span className='truncate'>
                  {kindLabel(row)} · {data.artist.name}
                </span>
              </span>
            }
            meta={<ConnectionUrlDisplay row={row} />}
            stableLayout
            titleLineClamp={1}
            subtitleLineClamp={1}
            reserveSubtitleSlot
            reserveMetaSlot
            metaOverflow='scroll'
            actions={
              <DrawerHeaderActions
                primaryActions={[]}
                overflowActions={[]}
                menuItems={contextMenuItems}
                onClose={onClose}
              />
            }
            bodyClassName='pr-8'
            data-testid='profiles-rail-entity-header'
          />
        ) : undefined
      }
    >
      {row ? (
        <div className='space-y-2'>
          <DrawerAnalyticsSummaryCard
            state='ready'
            metrics={[
              {
                id: 'status',
                label: 'Status',
                value: getConnectionStatus(row).label,
                hint: MONITORING_LABELS[row.monitoringState],
              },
              {
                id: 'rank',
                label: 'Search Rank',
                value:
                  row.rowType === 'surface' && row.monitoringState !== 'locked'
                    ? String(row.rank ?? '—')
                    : '—',
                hint: rankChange === '—' ? 'No change yet' : rankChange,
              },
            ]}
            footer={
              <ShareableLinkRow
                url={
                  row.rowType === 'surface' && row.kind === 'social'
                    ? (row.trackedUrl ?? row.url)
                    : row.url
                }
                density='rail'
                testId='profiles-rail-shareable-link'
              />
            }
            stableLayout
            reserveFooterSlot
            testId='profiles-rail-summary'
          />
          <DrawerSection
            title='Profile / Page'
            sectionKind='facts'
            className='space-y-2'
          >
            <RailMetric label='Type' value={kindLabel(row)} />
            <RailMetric label='Status' value={getConnectionStatus(row).label} />
            <RailMetric
              label='Monitoring'
              value={MONITORING_LABELS[row.monitoringState]}
            />
          </DrawerSection>
          <DrawerSection title='Next Best Action' sectionKind='status'>
            <p className='text-xs leading-5 text-secondary-token'>
              {getConnectionStatus(row).nextAction}
            </p>
          </DrawerSection>
          <DrawerSection sectionKind='details'>
            <div
              className={cn(
                'grid gap-2 px-1',
                primaryAction === 'open' ? 'grid-cols-1' : 'grid-cols-2'
              )}
            >
              <Button asChild variant='secondary' size='sm'>
                <Link
                  href={row.url}
                  target={row.url.startsWith('http') ? '_blank' : undefined}
                  rel={row.url.startsWith('http') ? 'noreferrer' : undefined}
                >
                  <ExternalLink className='h-3.5 w-3.5' /> Open
                </Link>
              </Button>
              {primaryAction !== 'open' ? (
                <Button asChild size='sm'>
                  <Link
                    href={
                      primaryAction === 'upgrade'
                        ? APP_ROUTES.SETTINGS_BILLING
                        : row.rowType === 'connector'
                          ? APP_ROUTES.SETTINGS_CONNECTORS
                          : APP_ROUTES.SETTINGS_ARTIST_PROFILE
                    }
                  >
                    {primaryAction === 'upgrade'
                      ? 'Upgrade'
                      : primaryAction === 'connect'
                        ? 'Connect'
                        : primaryAction === 'reconnect'
                          ? 'Reconnect'
                          : 'Review'}
                  </Link>
                </Button>
              ) : null}
            </div>
          </DrawerSection>
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
      <span className='max-w-36 truncate text-primary-token'>{value}</span>
    </div>
  );
}

function PresenceOutcomeStrip({
  data,
}: Readonly<{ data: ProfilesWorkspaceData }>) {
  const publicProfileHref =
    data.artist.isPublic && data.artist.username
      ? `/${encodeURIComponent(data.artist.username)}`
      : APP_ROUTES.SETTINGS_ARTIST_PROFILE;
  const monitoredPages =
    data.monitoringLimit === null
      ? String(data.monitoredCount)
      : `${data.monitoredCount} of ${data.monitoringLimit}`;
  const outcomes: ReadonlyArray<{
    readonly label: string;
    readonly value: string;
    readonly detail: string;
    readonly href?: string;
  }> = [
    {
      label: 'Search Visibility',
      value: !data.providerAvailable
        ? 'Unavailable'
        : data.bestJovieRank === null
          ? 'Not Measured'
          : `#${data.bestJovieRank}`,
      detail: 'Ranking across public profile pages',
    },
    {
      label: 'Answer Visibility',
      value: data.artist.isPublic ? 'Published' : 'Draft',
      detail: 'Structured artist facts and FAQs',
      href: publicProfileHref,
    },
    {
      label: 'Audience Quality',
      value: 'Engagement Scored',
      detail: 'Filter fans by source, segment, and activity',
      href: APP_ROUTES.CONTACTS,
    },
    {
      label: 'Monitored Pages',
      value: monitoredPages,
      detail: 'Profiles and pages tracked for changes',
    },
  ];

  return (
    <section
      aria-label='Artist Presence Outcomes'
      data-testid='presence-outcomes'
      className='grid shrink-0 grid-cols-2 border-b border-subtle lg:grid-cols-4'
    >
      {outcomes.map(outcome => {
        const content = (
          <>
            <span className='block text-2xs font-medium text-tertiary-token'>
              {outcome.label}
            </span>
            <span className='mt-1 flex items-center gap-1.5 text-sm font-semibold text-primary-token'>
              {outcome.value}
              {outcome.href ? (
                <ArrowUpRight
                  className='h-3.5 w-3.5 text-tertiary-token'
                  aria-hidden
                />
              ) : null}
            </span>
            <span className='mt-1 block text-2xs leading-4 text-tertiary-token'>
              {outcome.detail}
            </span>
          </>
        );
        const className =
          'min-h-22 border-b border-subtle px-3 py-3 text-left even:border-l lg:min-h-20 lg:border-b-0 lg:border-l lg:first:border-l-0';

        return outcome.href ? (
          <Link
            key={outcome.label}
            href={outcome.href}
            className={cn(
              className,
              'transition-colors duration-fast hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-focus/50'
            )}
          >
            {content}
          </Link>
        ) : (
          <div key={outcome.label} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}

export function ProfilesWorkspace({
  data,
}: Readonly<{ data: ProfilesWorkspaceData | null }>) {
  const [filter, setFilter] = useState<ProfilesWorkspaceFilter>('all');
  const [selected, setSelected] = useState<ProfileWorkspaceRow | null>(null);
  const [isAddConnectionOpen, setIsAddConnectionOpen] = useState(false);
  const [pendingCandidate, setPendingCandidate] =
    useState<ConnectionIntakeCandidate | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('add') === 'service') {
      router.replace(APP_ROUTES.SETTINGS_CONNECTORS);
    }
  }, [router, searchParams]);
  const pendingRow = useMemo<ProfileWorkspaceRow | null>(() => {
    if (!pendingCandidate) return null;
    return {
      id: `preview:${pendingCandidate.id}`,
      rowType: 'surface',
      kind:
        pendingCandidate.category === 'website'
          ? 'website'
          : pendingCandidate.category,
      platform: pendingCandidate.platformId,
      label: pendingCandidate.title,
      handle: 'Preview only · not saved',
      url: pendingCandidate.url,
      trackedUrl: null,
      qualificationStatus: 'suggested',
      isOfficial: false,
      monitoringState: 'unavailable',
      rank: null,
      previousRank: null,
      lastObservedAt: null,
    };
  }, [pendingCandidate]);
  const rows = useMemo(() => {
    const sourceRows = pendingRow
      ? [pendingRow, ...(data?.rows ?? [])]
      : (data?.rows ?? []);
    return sortProfileWorkspaceRows(
      filterProfileWorkspaceRows(sourceRows, filter)
    );
  }, [data?.rows, filter, pendingRow]);
  const handleAddConnection = useCallback(() => {
    setSelected(null);
    setPendingCandidate(null);
    setIsAddConnectionOpen(true);
  }, []);
  const headerActions = useMemo(
    () => (
      <DashboardHeaderActionGroup>
        <DashboardHeaderActionButton
          ariaLabel='Add Profile Or Site'
          onClick={handleAddConnection}
          icon={<Plus className='h-3.5 w-3.5' />}
          label='Add Profile Or Site'
        />
      </DashboardHeaderActionGroup>
    ),
    [handleAddConnection]
  );
  useRegisterHeaderActions(headerActions);
  const getContextMenuItems = useCallback(
    (row: ProfileWorkspaceRow): ContextMenuItemType[] => {
      if (row.id.startsWith('preview:')) return [];
      const primaryAction = getConnectionPrimaryAction(row);
      return buildConnectionActions(row, primaryAction, {
        onViewDetails: setSelected,
        onOpen: connection => {
          if (connection.url.startsWith('http')) {
            globalThis.open(connection.url, '_blank', 'noopener,noreferrer');
            return;
          }
          router.push(connection.url);
        },
        onPrimaryAction: connection => {
          const action = getConnectionPrimaryAction(connection);
          router.push(
            action === 'upgrade'
              ? APP_ROUTES.SETTINGS_BILLING
              : connection.rowType === 'connector'
                ? APP_ROUTES.SETTINGS_CONNECTORS
                : APP_ROUTES.SETTINGS_ARTIST_PROFILE
          );
        },
      });
    },
    [router]
  );
  const columns = useMemo(
    () => [
      columnHelper.accessor('label', {
        header: 'Profile / Page',
        size: 220,
        minSize: 160,
        meta: { className: 'px-3' },
        cell: context => {
          const row = context.row.original;
          return (
            <div className='flex min-w-0 items-center gap-2.5'>
              <ConnectionBrandIcon
                row={row}
                className='h-5 w-5 shrink-0'
                emphasized={selected?.id === row.id}
              />
              <div className='min-w-0'>
                <div className='truncate text-sm font-medium text-primary-token'>
                  {row.label}
                </div>
                <ConnectionUrlDisplay
                  row={row}
                  className='text-xs text-tertiary-token max-sm:hidden'
                />
              </div>
            </div>
          );
        },
      }),
      columnHelper.display({
        id: 'type',
        header: () => <span className='sr-only'>Type</span>,
        size: 48,
        meta: { className: 'px-3' },
        cell: context => <TypeCell row={context.row.original} />,
      }),
      columnHelper.accessor(row => getConnectionStatus(row).label, {
        id: 'status',
        header: () => <span className='sr-only'>Status / Issue</span>,
        size: 48,
        meta: { className: 'px-3' },
        cell: context => <StatusCell row={context.row.original} />,
      }),
      columnHelper.display({
        id: 'rank',
        header: 'Search Rank',
        size: 72,
        meta: { className: 'max-lg:hidden' },
        cell: context => <RankCell row={context.row.original} />,
      }),
      columnHelper.display({
        id: 'change',
        header: 'Change',
        size: 78,
        meta: { className: 'max-xl:hidden' },
        cell: context => {
          const row = context.row.original;
          if (row.rowType === 'connector') {
            return (
              <EmptyCell tooltip='Rank change is not available for connectors.' />
            );
          }
          const change = formatProfileRankChange(row.rank, row.previousRank);
          if (change === '—') {
            return <EmptyCell tooltip='No previous rank measurement.' />;
          }
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
        size: 124,
        meta: { className: 'max-2xl:hidden' },
        cell: context => <MonitoringCell row={context.row.original} />,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        size: 44,
        meta: {
          className: 'px-3',
          headerVisibility: 'sr-only',
          actionVisibility: 'contextual',
        },
        cell: context => {
          const row = context.row.original;
          if (row.id.startsWith('preview:')) return null;
          const actionItems = convertContextMenuItems(getContextMenuItems(row));
          return (
            <div className='flex justify-end'>
              <TableActionMenu items={actionItems} align='end' trigger='custom'>
                <button
                  type='button'
                  aria-label={`Actions for ${row.label}`}
                  onClick={event => event.stopPropagation()}
                  onKeyDown={event => event.stopPropagation()}
                  className='inline-flex h-11 w-11 items-center justify-center rounded-full border border-transparent bg-transparent text-tertiary-token transition-colors duration-fast hover:bg-surface-1 hover:text-primary-token focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus/50 sm:h-7 sm:w-7'
                >
                  <MoreHorizontal className='h-4 w-4' aria-hidden />
                </button>
              </TableActionMenu>
            </div>
          );
        },
      }),
    ],
    [getContextMenuItems, selected?.id]
  );

  useRegisterRightPanel(
    data ? (
      isAddConnectionOpen ? (
        <AddConnectionRail
          data={data}
          onClose={() => {
            setPendingCandidate(null);
            setIsAddConnectionOpen(false);
          }}
          onCandidatePreview={candidate => {
            setPendingCandidate(candidate);
            if (!candidate) return;
            setFilter(
              candidate.category === 'website' ? 'website' : candidate.category
            );
          }}
          onReviewCandidate={candidate => {
            setPendingCandidate(candidate);
            setFilter(
              candidate.category === 'website' ? 'website' : candidate.category
            );
            setIsAddConnectionOpen(false);
          }}
          onReviewSuggestions={() => {
            setFilter('social');
            setSelected(null);
            setPendingCandidate(null);
            setIsAddConnectionOpen(false);
          }}
        />
      ) : selected ? (
        <ConnectionRail
          data={data}
          row={selected}
          onClose={() => setSelected(null)}
          contextMenuItems={convertToCommonDropdownItems(
            getContextMenuItems(selected)
          )}
        />
      ) : null
    ) : null
  );

  if (!data) {
    return (
      <PageShell data-testid='profiles-workspace'>
        <EmptyState
          icon={<UserRound className='h-5 w-5' aria-hidden />}
          heading='No Artist Profile Selected'
          description='Set up an artist profile to monitor its presence.'
          action={{
            label: 'Set Up Artist Profile',
            href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
          }}
          testId='profiles-workspace-empty-state'
          className='min-h-75'
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      data-testid='profiles-workspace'
      surfaceMode='table'
      toolbar={
        <PageToolbar
          data-testid='connections-workspace-toolbar'
          start={FILTERS.map(option => (
            <PageToolbarTabButton
              key={option.id}
              label={option.label}
              active={filter === option.id}
              onClick={() => {
                setFilter(option.id);
                setSelected(null);
              }}
            />
          ))}
        />
      }
    >
      <PresenceOutcomeStrip data={data} />
      <UnifiedTable
        data={rows}
        columns={columns as ColumnDef<ProfileWorkspaceRow, unknown>[]}
        getRowId={row => row.id}
        onRowClick={row => {
          if (!row.id.startsWith('preview:')) setSelected(row);
        }}
        onRowContextMenu={(row, event) => {
          if (row.id.startsWith('preview:')) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        getContextMenuItems={getContextMenuItems}
        rowHeight={56}
        minWidth='390px'
        isRowSelected={row =>
          !row.id.startsWith('preview:') && selected?.id === row.id
        }
        getRowClassName={row =>
          cn(
            'group/connection-row',
            row.id.startsWith('preview:') && 'cursor-default'
          )
        }
        emptyState={
          <TableEmptyState
            title='No Presence in This Category'
            description='Try another filter.'
          />
        }
      />
    </PageShell>
  );
}
