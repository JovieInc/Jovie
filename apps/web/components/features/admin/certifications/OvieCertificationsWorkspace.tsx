'use client';

import { Button } from '@jovie/ui';
import { AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/components/feedback';
import { PageShell } from '@/components/organisms/PageShell';
import {
  PAGE_TOOLBAR_MENU_TRIGGER_CLASS,
  PAGE_TOOLBAR_META_TEXT_CLASS,
  PageToolbarActionButton,
  PageToolbarTabButton,
  rowState,
  TableEmptyState,
} from '@/components/organisms/table';
import { ShellDropdown } from '@/components/shell/ShellDropdown';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import {
  OVIE_CERTIFICATION_DOMAIN_LABELS,
  OVIE_CERTIFICATION_DOMAINS,
  OVIE_CERTIFICATION_STATE_LABELS,
  type OvieCertificationDecisionKind,
  type OvieCertificationInventory,
  type OvieCertificationRow,
} from '@/lib/ovie/certifications/types';
import {
  getCertificationDecisionErrorMessage,
  useOvieCertificationDecisionMutation,
  useOvieCertificationsQuery,
} from '@/lib/queries/useOvieCertificationsQuery';
import {
  type ColumnDef,
  createColumnHelper,
  type SortingState,
} from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/utils/date-formatting';
import { CertificationDetailRail } from './CertificationDetailRail';
import { CertificationFiltersMenu } from './CertificationFiltersMenu';
import { CertificationStateGlyph } from './CertificationGlyphs';
import {
  CertificationEvidenceStrip,
  CertificationIdentity,
} from './CertificationSummary';
import { CertificationWalkthrough } from './CertificationWalkthrough';
import {
  CERTIFICATION_STATE_FILTERS,
  CERTIFICATION_STATE_RANK,
  type CertificationBlockerFilter,
  type CertificationDomainFilter,
  type CertificationFreshnessFilter,
  type CertificationStateFilter,
  countRowsByState,
  filterCertificationRows,
  isInventoryStale,
  passedTierCount,
} from './certification-view';

const columnHelper = createColumnHelper<OvieCertificationRow>();

/** Overnight inventories are small; virtualize only when rows get long. */
const VIRTUALIZE_AFTER_ROWS = 80;

/** Fits beside the 400px rail on a 1280px Mac window without scrolling. */
const TABLE_MIN_WIDTH_PX = 720;

const DECISION_TOASTS: Record<OvieCertificationDecisionKind, string> = {
  approved: 'Certified',
  changes_requested: 'Changes requested',
  rejected: 'Rejected',
};

function StateCell({ row }: { readonly row: OvieCertificationRow }) {
  return (
    <span className='flex items-center'>
      <CertificationStateGlyph state={row.state} />
    </span>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
function buildColumns(): ColumnDef<OvieCertificationRow, any>[] {
  return [
    columnHelper.accessor(row => CERTIFICATION_STATE_RANK[row.state], {
      id: 'state',
      header: 'State',
      cell: ({ row }) => <StateCell row={row.original} />,
      size: 36,
      meta: { headerVisibility: 'sr-only' },
    }),
    columnHelper.accessor(row => row.subject.title.toLowerCase(), {
      id: 'subject',
      header: 'Item',
      cell: ({ row }) => <CertificationIdentity row={row.original} />,
      size: 280,
    }),
    columnHelper.accessor(
      row => `${OVIE_CERTIFICATION_DOMAIN_LABELS[row.domain]} ${row.surface}`,
      {
        id: 'domain',
        header: 'Domain',
        cell: ({ row }) => (
          <span className='truncate text-xs text-tertiary-token'>
            {OVIE_CERTIFICATION_DOMAIN_LABELS[row.original.domain]} ·{' '}
            {row.original.surface}
          </span>
        ),
        size: 180,
      }
    ),
    columnHelper.accessor(row => passedTierCount(row), {
      id: 'evidence',
      header: 'Evidence',
      cell: ({ row }) => <CertificationEvidenceStrip row={row.original} />,
      size: 136,
      sortDescFirst: true,
    }),
    columnHelper.accessor(row => row.blockers.length, {
      id: 'blockers',
      header: 'Blockers',
      cell: ({ getValue }) => {
        const count = getValue() as number;
        return (
          <span
            className={cn(
              'tabular-nums text-xs',
              count > 0 ? 'text-secondary-token' : 'text-quaternary-token'
            )}
          >
            {count > 0 ? count : '—'}
          </span>
        );
      },
      size: 72,
      sortDescFirst: true,
    }),
    columnHelper.accessor(row => Date.parse(row.updatedAt), {
      id: 'updated',
      header: 'Updated',
      cell: ({ row }) => (
        <time
          dateTime={row.original.updatedAt}
          title={new Date(row.original.updatedAt).toLocaleString()}
          className='whitespace-nowrap text-xs tabular-nums text-tertiary-token'
        >
          {formatTimeAgo(row.original.updatedAt)}
        </time>
      ),
      size: 84,
      sortDescFirst: true,
    }),
  ];
}

function IssuesMenu({
  issues,
}: {
  readonly issues: OvieCertificationInventory['issues'];
}) {
  if (issues.length === 0) return null;
  return (
    <ShellDropdown
      align='end'
      width={360}
      trigger={
        <Button
          type='button'
          variant='ghost'
          size='sm'
          className={PAGE_TOOLBAR_MENU_TRIGGER_CLASS}
        >
          <AlertTriangle
            className='h-3.5 w-3.5 text-warning'
            aria-hidden='true'
          />
          <span>
            {issues.length} Issue{issues.length === 1 ? '' : 's'}
          </span>
        </Button>
      }
    >
      <ShellDropdown.Label>Packet Issues</ShellDropdown.Label>
      {issues.map(issue => (
        <ShellDropdown.Item
          key={`${issue.source}:${issue.message}`}
          label={issue.source}
          description={issue.message}
        />
      ))}
    </ShellDropdown>
  );
}

function FreshnessMeta({
  generatedAt,
  refreshFailed,
}: {
  readonly generatedAt: string | undefined;
  readonly refreshFailed: boolean;
}) {
  const stale = refreshFailed || isInventoryStale(generatedAt);
  return (
    <span
      className={cn(
        PAGE_TOOLBAR_META_TEXT_CLASS,
        'inline-flex min-w-28 justify-end',
        // Fresh data yields the toolbar to the state filters on narrow
        // windows; stale data always stays visible.
        stale ? 'text-warning' : 'max-2xl:hidden'
      )}
      data-testid='certification-freshness'
      data-stale={stale ? 'true' : 'false'}
    >
      {generatedAt
        ? stale
          ? `Stale · ${formatTimeAgo(generatedAt)}`
          : `Updated ${formatTimeAgo(generatedAt)}`
        : ''}
    </span>
  );
}

export function OvieCertificationsWorkspace({
  initialDomain = 'all',
}: {
  readonly initialDomain?: CertificationDomainFilter;
}) {
  const query = useOvieCertificationsQuery();
  // useMutation returns a new object every render; only the stable
  // mutateAsync may feed memoized callbacks, or the registered right panel
  // changes identity on every render and re-renders its host forever.
  const { mutateAsync: submitDecision } =
    useOvieCertificationDecisionMutation();
  const [stateFilter, setStateFilter] =
    useState<CertificationStateFilter>('all');
  const [domainFilter, setDomainFilter] =
    useState<CertificationDomainFilter>(initialDomain);
  // Needs You judgment cards deep-link here with ?row=<rowId> so the founder
  // lands on the exact evidence rail, not a re-search.
  const searchParams = useSearchParams();
  const linkedRowId = searchParams.get('row');
  const linkedDomain = searchParams.get('domain');
  useEffect(() => {
    setDomainFilter(
      (OVIE_CERTIFICATION_DOMAINS as readonly string[]).includes(
        linkedDomain ?? ''
      )
        ? (linkedDomain as CertificationDomainFilter)
        : initialDomain
    );
  }, [linkedDomain, initialDomain]);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [freshnessFilter, setFreshnessFilter] =
    useState<CertificationFreshnessFilter>('all');
  const [blockerFilter, setBlockerFilter] =
    useState<CertificationBlockerFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setSelectedId(linkedRowId), [linkedRowId]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'state', desc: false },
  ]);
  const [pendingDecision, setPendingDecision] =
    useState<OvieCertificationDecisionKind | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);

  const inventory = query.data;
  const allRows = useMemo(() => inventory?.rows ?? [], [inventory]);
  const domainRows = useMemo(
    () =>
      filterCertificationRows(allRows, {
        state: 'all',
        domain: domainFilter,
        owner: ownerFilter,
        freshness: freshnessFilter,
        blockers: blockerFilter,
      }),
    [allRows, domainFilter, ownerFilter, freshnessFilter, blockerFilter]
  );
  const counts = useMemo(() => countRowsByState(domainRows), [domainRows]);
  const rows = useMemo(
    () =>
      filterCertificationRows(allRows, {
        state: stateFilter,
        domain: domainFilter,
        owner: ownerFilter,
        freshness: freshnessFilter,
        blockers: blockerFilter,
      }),
    [
      allRows,
      stateFilter,
      domainFilter,
      ownerFilter,
      freshnessFilter,
      blockerFilter,
    ]
  );
  const selected = useMemo(
    () => allRows.find(row => row.id === selectedId) ?? null,
    [allRows, selectedId]
  );

  useEffect(() => {
    setDecisionError(null);
  }, [selectedId]);

  const handleDecide = useCallback(
    async (kind: OvieCertificationDecisionKind, notes: string | null) => {
      if (!selected?.decision.evidenceDigest) return false;
      setPendingDecision(kind);
      setDecisionError(null);
      try {
        await submitDecision({
          rowId: selected.id,
          evidenceDigest: selected.decision.evidenceDigest,
          decision: kind,
          notes,
          actionId: crypto.randomUUID(),
        });
        toast.success(DECISION_TOASTS[kind]);
        return true;
      } catch (error) {
        setDecisionError(getCertificationDecisionErrorMessage(error));
        return false;
      } finally {
        setPendingDecision(null);
      }
    },
    [submitDecision, selected]
  );

  // biome-ignore lint/suspicious/noExplicitAny: TanStack Table requires any for mixed-value-type column arrays
  const columns = useMemo<ColumnDef<OvieCertificationRow, any>[]>(
    () => buildColumns(),
    []
  );

  const getRowClassName = useCallback(
    (row: OvieCertificationRow) =>
      row.id === selectedId
        ? `group cursor-pointer ${rowState.selected}`
        : `group cursor-pointer ${rowState.hover}`,
    [selectedId]
  );

  const handleFocusedRowChange = useCallback(
    (index: number) => {
      const row = rows[index];
      if (row) setSelectedId(row.id);
    },
    [rows]
  );

  const rail = useMemo(
    () => (
      <CertificationDetailRail
        row={selected}
        onClose={() => setSelectedId(null)}
        onDecide={handleDecide}
        onWalkthrough={() => setWalkthroughOpen(true)}
        pendingDecision={pendingDecision}
        decisionError={decisionError}
      />
    ),
    [selected, handleDecide, pendingDecision, decisionError]
  );
  useRegisterRightPanel(rail);

  const loadFailed = query.isError && !inventory;
  const refreshFailed = query.isError && Boolean(inventory);
  const filtersActive =
    stateFilter !== 'all' ||
    domainFilter !== 'all' ||
    ownerFilter !== 'all' ||
    freshnessFilter !== 'all' ||
    blockerFilter !== 'all';
  const domainLoadFailed = Boolean(
    inventory?.domains.some(
      domain =>
        domain.status === 'error' &&
        (domainFilter === 'all' || domain.domain === domainFilter)
    )
  );

  let emptyState = (
    <TableEmptyState
      icon={<ShieldCheck className='h-5 w-5' aria-hidden='true' />}
      heading='No certification items yet'
      description='Connected domains have no packets. Overnight workers add items as they land evidence.'
    />
  );
  if (loadFailed || domainLoadFailed || refreshFailed) {
    emptyState = (
      <TableEmptyState
        icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
        heading='Certifications unavailable'
        description='Some certification sources could not load. Retry to check for items.'
        variant='error'
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
      />
    );
  } else if (filtersActive && allRows.length > 0) {
    emptyState = (
      <TableEmptyState
        icon={<ShieldCheck className='h-5 w-5' aria-hidden='true' />}
        heading='No items match these filters'
        action={{
          label: 'Clear Filters',
          onClick: () => {
            setStateFilter('all');
            setDomainFilter('all');
            setOwnerFilter('all');
            setFreshnessFilter('all');
            setBlockerFilter('all');
          },
        }}
      />
    );
  }

  return (
    <PageShell
      frame='none'
      contentPadding='none'
      surfaceMode='table'
      data-testid='ovie-certifications-page'
      contentClassName='min-h-0'
    >
      <div className='flex h-full min-h-0 flex-col'>
        <AdminTableSubheader
          className='border-b border-(--app-shell-frame-seam)'
          start={
            <div
              className='flex items-center gap-0.5'
              role='toolbar'
              aria-label='Filter By State'
            >
              {CERTIFICATION_STATE_FILTERS.map(filter => (
                <PageToolbarTabButton
                  key={filter}
                  active={stateFilter === filter}
                  onClick={() => setStateFilter(filter)}
                  label={
                    <span className='inline-flex items-center gap-1.5 whitespace-nowrap'>
                      {filter === 'all'
                        ? 'All'
                        : OVIE_CERTIFICATION_STATE_LABELS[filter]}
                      <span
                        className='min-w-4 text-left tabular-nums text-quaternary-token'
                        data-testid={`certification-count-${filter}`}
                      >
                        {inventory ? counts[filter] : ''}
                      </span>
                    </span>
                  }
                />
              ))}
            </div>
          }
          end={
            <>
              <IssuesMenu issues={inventory?.issues ?? []} />
              <CertificationFiltersMenu
                rows={allRows}
                domains={inventory?.domains ?? []}
                domain={domainFilter}
                onDomainChange={setDomainFilter}
                owner={ownerFilter}
                onOwnerChange={setOwnerFilter}
                freshness={freshnessFilter}
                onFreshnessChange={setFreshnessFilter}
                blockers={blockerFilter}
                onBlockersChange={setBlockerFilter}
              />
              <FreshnessMeta
                generatedAt={inventory?.generatedAt}
                refreshFailed={refreshFailed}
              />
              <PageToolbarActionButton
                label='Refresh'
                ariaLabel='Refresh Certifications'
                tooltipLabel={
                  inventory?.generatedAt
                    ? `Refresh · updated ${formatTimeAgo(inventory.generatedAt)}`
                    : 'Refresh'
                }
                iconOnly
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                icon={
                  <RefreshCw
                    className={cn(
                      'h-3.5 w-3.5',
                      query.isFetching && 'motion-safe:animate-spin'
                    )}
                  />
                }
              />
            </>
          }
        />
        <AdminTableShell testId='ovie-certifications-table'>
          {() => (
            <AdminDataTable
              data={rows}
              columns={columns}
              isLoading={query.isLoading}
              skeletonRows={12}
              enableVirtualization={rows.length > VIRTUALIZE_AFTER_ROWS}
              minWidth={`${TABLE_MIN_WIDTH_PX}px`}
              sorting={sorting}
              onSortingChange={setSorting}
              getRowId={row => row.id}
              getRowClassName={getRowClassName}
              getRowTestId={row => `certification-row-${row.id}`}
              onRowClick={row => setSelectedId(row.id)}
              onFocusedRowChange={handleFocusedRowChange}
              emptyState={emptyState}
            />
          )}
        </AdminTableShell>
        <CertificationWalkthrough
          row={selected}
          open={walkthroughOpen}
          onOpenChange={setWalkthroughOpen}
          onDecide={handleDecide}
          pendingDecision={pendingDecision}
        />
      </div>
    </PageShell>
  );
}
