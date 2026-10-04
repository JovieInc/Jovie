'use client';

import { Button, SimpleTooltip } from '@jovie/ui';
import { ExternalLink } from 'lucide-react';
import { useMemo, useState } from 'react';
import { EmptyCell } from '@/components/atoms/EmptyCell';
import {
  DrawerSection,
  EntityHeader,
  EntitySidebarShell,
  ShareableLinkRow,
} from '@/components/molecules/drawer';
import { DrawerHeaderActions } from '@/components/molecules/drawer-header/DrawerHeaderActions';
import {
  PageToolbar,
  PageToolbarTabButton,
  TableEmptyState,
  UnifiedTable,
} from '@/components/organisms/table';
import { WorkspacePage } from '@/components/organisms/WorkspacePage';
import { BASE_URL } from '@/constants/domains';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  COMPANY_PAGE_KIND_LABELS,
  COMPANY_PRESENCE_CHECK_IDS,
  COMPANY_PRESENCE_CHECK_LABELS,
  type CompanyPresenceCheck,
  type CompanyPresenceCheckId,
  type CompanyPresenceData,
  type CompanyPresenceFilter,
  type CompanyPresencePage,
  filterCompanyPresencePages,
  getCompanyPageLastCheckedAt,
  getCompanyPageSignals,
  getCompanyPageStatus,
  sortCompanyPresencePages,
} from '@/lib/ovie/company-presence/model';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import {
  PresenceSignalList,
  PresenceStatusBadge,
} from '../../profiles/PresenceStatusParts';
import styles from '../../profiles/profiles-workspace.module.css';

const columnHelper = createColumnHelper<CompanyPresencePage>();

const FILTERS: ReadonlyArray<{
  readonly id: CompanyPresenceFilter;
  readonly label: string;
}> = [
  { id: 'all', label: 'All Pages' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'profile', label: 'Profiles' },
  { id: 'legal', label: 'Legal' },
  { id: 'machine', label: 'Machine' },
];

function absoluteUrl(path: string): string {
  return `${BASE_URL.replace(/\/$/, '')}${path}`;
}
function formatCheckedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
/** A check never renders as a number unless a source measured it. */
function CheckCell({ check }: Readonly<{ check: CompanyPresenceCheck }>) {
  if (check.state === 'unconfigured') {
    return (
      <SimpleTooltip content={check.reason}>
        <span
          className='text-xs text-tertiary-token'
          data-testid='company-presence-check-unconfigured'
        >
          Unconfigured
        </span>
      </SimpleTooltip>
    );
  }
  return (
    <span
      className={cn(
        'text-xs tabular-nums capitalize',
        check.outcome === 'pass' && 'text-success',
        check.outcome === 'warn' && 'text-warning',
        check.outcome === 'fail' && 'text-error'
      )}
      data-testid='company-presence-check-measured'
    >
      {check.summary} · {check.outcome}
    </span>
  );
}

function LastCheckedCell({ page }: Readonly<{ page: CompanyPresencePage }>) {
  const label = formatCheckedAt(getCompanyPageLastCheckedAt(page));
  if (!label) {
    return <EmptyCell tooltip='No source has checked this page yet.' />;
  }
  return <span className='text-xs text-secondary-token'>{label}</span>;
}

function RailRow({
  label,
  children,
}: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className='flex items-center justify-between gap-3 text-xs'>
      <span className='text-tertiary-token'>{label}</span>
      <span className='min-w-0 truncate text-right'>{children}</span>
    </div>
  );
}

function CompanyPageRail({
  page,
  onClose,
}: Readonly<{ page: CompanyPresencePage | null; onClose: () => void }>) {
  const status = page ? getCompanyPageStatus(page) : null;
  return (
    <EntitySidebarShell
      isOpen={page !== null}
      ariaLabel='Page details'
      onClose={onClose}
      scrollStrategy='shell'
      workspaceSurface='raised'
      headerMode='minimal'
      hideMinimalHeaderBar
      isEmpty={!page}
      emptyMessage='Select a page to view details.'
      entityHeader={
        page ? (
          <EntityHeader
            title={page.label}
            subtitle={`${COMPANY_PAGE_KIND_LABELS[page.kind]} · ${page.path}`}
            meta={
              <ShareableLinkRow
                url={absoluteUrl(page.path)}
                density='rail'
                testId='company-presence-rail-link'
              />
            }
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
                onClose={onClose}
              />
            }
            bodyClassName='pr-8'
            data-testid='company-presence-rail-header'
          />
        ) : undefined
      }
    >
      {page && status ? (
        <div className='space-y-2'>
          <DrawerSection title='Checks' sectionKind='facts'>
            <div className='space-y-2'>
              <RailRow label='Status'>
                <PresenceStatusBadge status={status} />
              </RailRow>
              {COMPANY_PRESENCE_CHECK_IDS.map(id => (
                <RailRow key={id} label={COMPANY_PRESENCE_CHECK_LABELS[id]}>
                  <CheckCell check={page.checks[id]} />
                </RailRow>
              ))}
              <RailRow label='Last Checked'>
                <LastCheckedCell page={page} />
              </RailRow>
            </div>
          </DrawerSection>
          <PresenceSignalList signals={getCompanyPageSignals(page)} />
          <DrawerSection sectionKind='details'>
            <div className='grid grid-cols-1 gap-2 px-1'>
              <Button asChild variant='secondary' size='sm'>
                <a
                  href={absoluteUrl(page.path)}
                  target='_blank'
                  rel='noreferrer'
                >
                  <ExternalLink className='h-3.5 w-3.5' /> Open
                </a>
              </Button>
            </div>
          </DrawerSection>
        </div>
      ) : null}
    </EntitySidebarShell>
  );
}

function checkColumn(
  id: CompanyPresenceCheckId,
  size: number,
  hideBelow?: string
) {
  return columnHelper.display({
    id,
    header: COMPANY_PRESENCE_CHECK_LABELS[id],
    size,
    meta: { className: hideBelow },
    cell: context => <CheckCell check={context.row.original.checks[id]} />,
  });
}

/** Jovie's own pages using the creator Presence workspace primitives. */
export function CompanyPresenceWorkspace({
  data,
}: Readonly<{ data: CompanyPresenceData }>) {
  const [filter, setFilter] = useState<CompanyPresenceFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rows = useMemo(
    () =>
      sortCompanyPresencePages(filterCompanyPresencePages(data.pages, filter)),
    [data.pages, filter]
  );
  const selected = data.pages.find(page => page.id === selectedId) ?? null;
  const configuredSources = data.sources.filter(source => source.configured);

  useRegisterRightPanel(
    selected ? (
      <CompanyPageRail page={selected} onClose={() => setSelectedId(null)} />
    ) : null
  );

  const columns = useMemo(
    () => [
      columnHelper.accessor('label', {
        header: 'Page',
        size: 220,
        minSize: 140,
        meta: { className: 'px-3' },
        cell: context => {
          const page = context.row.original;
          return (
            <div className='min-w-0'>
              <div className='truncate text-sm font-medium text-primary-token'>
                {page.label}
              </div>
              <div className='truncate text-xs text-tertiary-token'>
                {page.path}
              </div>
              <div className={styles.mobileStatus}>
                <PresenceStatusBadge status={getCompanyPageStatus(page)} />
              </div>
            </div>
          );
        },
      }),
      columnHelper.accessor(page => COMPANY_PAGE_KIND_LABELS[page.kind], {
        id: 'type',
        header: 'Type',
        size: 96,
        meta: { className: 'max-md:hidden' },
        cell: context => (
          <span className='text-xs text-secondary-token'>
            {context.getValue()}
          </span>
        ),
      }),
      columnHelper.accessor(page => getCompanyPageStatus(page).label, {
        id: 'status',
        header: 'Status',
        size: 132,
        meta: { className: cn('px-2', styles.statusColumn) },
        cell: context => (
          <PresenceStatusBadge
            status={getCompanyPageStatus(context.row.original)}
          />
        ),
      }),
      checkColumn('indexed', 104, 'max-lg:hidden'),
      checkColumn('seo_certification', 104, 'max-lg:hidden'),
      checkColumn('copy_gate', 104, 'max-xl:hidden'),
      checkColumn('lighthouse', 104, 'max-xl:hidden'),
      columnHelper.display({
        id: 'last_checked',
        header: 'Last Checked',
        size: 120,
        meta: { className: 'max-2xl:hidden' },
        cell: context => <LastCheckedCell page={context.row.original} />,
      }),
    ],
    []
  );

  return (
    <WorkspacePage
      frame='none'
      contentPadding='none'
      data-testid='company-presence-workspace'
      surfaceMode='table'
      toolbar={
        <PageToolbar
          data-testid='company-presence-toolbar'
          start={FILTERS.map(option => (
            <PageToolbarTabButton
              key={option.id}
              className={styles.filter}
              label={option.label}
              active={filter === option.id}
              onClick={() => {
                setFilter(option.id);
                setSelectedId(null);
              }}
            />
          ))}
          end={
            <SimpleTooltip
              content={
                configuredSources.length === data.sources.length
                  ? 'Every check has a connected source.'
                  : data.sources
                      .filter(source => !source.configured)
                      .map(source => `${source.label}: ${source.reason}`)
                      .join(' ')
              }
            >
              <span
                className='text-xs text-tertiary-token whitespace-nowrap'
                data-testid='company-presence-source-count'
              >
                {configuredSources.length} of {data.sources.length} Sources
                Connected
              </span>
            </SimpleTooltip>
          }
        />
      }
    >
      <UnifiedTable
        data={rows}
        columns={columns as ColumnDef<CompanyPresencePage, unknown>[]}
        getRowId={page => page.id}
        onRowClick={page => setSelectedId(page.id)}
        rowMode='two-line'
        containerClassName='min-h-0 flex-1'
        minWidth='0'
        className={styles.table}
        isRowSelected={page => page.id === selectedId}
        emptyState={
          filter === 'profile' && data.profilesUnavailable ? (
            <TableEmptyState
              heading='Profiles Unavailable'
              description='The owned-profile lookup failed. Refresh to try again.'
            />
          ) : (
            <TableEmptyState
              heading='No Pages in This Category'
              description={
                filter === 'profile'
                  ? 'No public profiles are owned by Jovie staff accounts.'
                  : 'Try another filter.'
              }
            />
          )
        }
      />
    </WorkspacePage>
  );
}
