'use client';

import { Badge } from '@jovie/ui';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@jovie/ui/atoms/popover';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import {
  Bot,
  GitPullRequestArrow,
  Info,
  LayoutGrid,
  Table2,
} from 'lucide-react';
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { rowState, TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import type { AgentRunArtifact, AgentRunStatus } from '@/lib/agent-os/artifact';
import { cn } from '@/lib/utils';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import { ArtifactDrawer } from './ArtifactDrawer';
import { formatGateName } from './VerificationGateList';
import {
  VerificationStatusPill,
  WorkflowStatusPill,
} from './WorkflowStatusPill';

const columnHelper = createColumnHelper<AgentRunArtifact>();
type BadgeVariant = ComponentProps<typeof Badge>['variant'];
type AgentOsViewMode = 'board' | 'table';

const BOARD_STATUSES = [
  'queued',
  'running',
  'review',
  'blocked',
  'failed',
  'stale',
  'done',
] as const satisfies readonly AgentRunStatus[];

const RUN_STATUS_LABEL: Record<AgentRunStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  blocked: 'Blocked',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
  stale: 'Stale',
};

const HUMAN_GATE_BADGES: Record<
  AgentRunArtifact['humanGate']['status'],
  { readonly label: string; readonly variant: BadgeVariant }
> = {
  not_required: { label: 'Not required', variant: 'secondary' },
  pending: { label: 'Review Required', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

function countPassedRequiredGates(artifact: AgentRunArtifact): string {
  const required = artifact.verificationGates.filter(gate => gate.required);
  const requiredTotal = required.length;
  const passed = required.filter(gate => gate.status === 'passed').length;

  if (requiredTotal === 0) {
    return `${artifact.verificationGates.length} gates`;
  }

  return `${passed}/${requiredTotal}`;
}

function formatGateProgressLabel(artifact: AgentRunArtifact): string {
  const progress = countPassedRequiredGates(artifact);
  return progress.includes('gate') ? progress : `Gates ${progress}`;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function formatCost(artifact: AgentRunArtifact): string {
  if (!artifact.costEstimate) return 'Not estimated';
  if (artifact.costEstimate.usd === 0) return '$0.00';
  return artifact.costEstimate.usd.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
}

function AgentRunDetailPopover({
  artifact,
}: Readonly<{ readonly artifact: AgentRunArtifact }>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          aria-label={`Inspect ${artifact.title}`}
          className='rounded-md p-1 text-tertiary-token opacity-70 transition-colors hover:bg-surface-1 hover:text-primary-token hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)'
        >
          <Info className='size-3.5' aria-hidden='true' />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='end'
        side='top'
        sideOffset={6}
        className='w-[340px] rounded-xl border border-(--linear-app-frame-seam) bg-surface-1 p-3 shadow-popover'
      >
        <div className='space-y-3'>
          <div className='min-w-0'>
            <p className='text-[12.5px] font-[590] text-primary-token'>
              {artifact.title}
            </p>
            <p className='mt-1 text-[12px] leading-5 text-secondary-token'>
              {artifact.summary}
            </p>
          </div>

          <dl className='grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px]'>
            <div className='min-w-0'>
              <dt className='text-tertiary-token'>Source</dt>
              <dd className='mt-0.5 truncate font-[540] text-primary-token'>
                {artifact.source}
              </dd>
            </div>
            <div className='min-w-0'>
              <dt className='text-tertiary-token'>Route</dt>
              <dd className='mt-0.5 truncate font-[540] text-primary-token'>
                {artifact.modelRoute}
              </dd>
            </div>
            <div className='min-w-0'>
              <dt className='text-tertiary-token'>Updated</dt>
              <dd className='mt-0.5 truncate font-[540] text-primary-token'>
                {formatUpdatedAt(artifact.updatedAt)}
              </dd>
            </div>
            <div className='min-w-0'>
              <dt className='text-tertiary-token'>Cost</dt>
              <dd className='mt-0.5 truncate font-[540] text-primary-token'>
                {formatCost(artifact)}
              </dd>
            </div>
          </dl>

          <div className='border-subtle border-t pt-2'>
            <div className='mb-2 flex items-center justify-between gap-2'>
              <p className='text-[12px] font-[560] text-primary-token'>
                Verification Gates
              </p>
              <span className='text-[11px] text-tertiary-token'>
                {countPassedRequiredGates(artifact)}
              </span>
            </div>
            <div className='grid gap-1.5'>
              {artifact.verificationGates.slice(0, 4).map(gate => (
                <div
                  key={gate.name}
                  className='flex min-w-0 items-center justify-between gap-2 text-[11.5px]'
                >
                  <p className='truncate text-secondary-token'>
                    {formatGateName(gate.name)}
                  </p>
                  <VerificationStatusPill status={gate.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AgentOsBoardCard({
  artifact,
  isSelected,
  onSelect,
}: Readonly<{
  readonly artifact: AgentRunArtifact;
  readonly isSelected: boolean;
  readonly onSelect: (artifact: AgentRunArtifact) => void;
}>) {
  return (
    <div
      data-testid={`agent-os-board-card-${artifact.id}`}
      className={cn(
        'group grid gap-2 rounded-lg border border-transparent px-2.5 py-2 transition-colors hover:border-subtle hover:bg-surface-1',
        isSelected && 'border-(--linear-border-focus) bg-surface-1'
      )}
    >
      <div className='flex min-w-0 items-start justify-between gap-2'>
        <button
          type='button'
          onClick={() => onSelect(artifact)}
          aria-label={artifact.title}
          aria-pressed={isSelected}
          className='min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus) focus-visible:ring-offset-2 focus-visible:ring-offset-(--linear-app-content-surface)'
        >
          <p className='line-clamp-2 text-[13px] font-[560] leading-5 text-primary-token'>
            {artifact.title}
          </p>
          <div className='mt-2 grid gap-1 text-[11.5px] leading-4 text-tertiary-token'>
            <p className='truncate font-[520] text-secondary-token'>
              {artifact.source}
              {artifact.sourceRunId ? (
                <span className='ml-1.5 font-[480] text-tertiary-token'>
                  {artifact.sourceRunId}
                </span>
              ) : null}
            </p>
            <p className='truncate tabular-nums'>
              {formatGateProgressLabel(artifact)}
            </p>
          </div>
        </button>
        <div className='flex shrink-0 items-center gap-1'>
          <AgentRunDetailPopover artifact={artifact} />
        </div>
      </div>
    </div>
  );
}

function AgentOsBoard({
  rows,
  selectedId,
  onSelect,
  statusFilter,
  onStatusFilterChange,
}: Readonly<{
  readonly rows: readonly AgentRunArtifact[];
  readonly selectedId: string | null;
  readonly onSelect: (artifact: AgentRunArtifact) => void;
  readonly statusFilter: AgentRunStatus | null;
  readonly onStatusFilterChange: (status: AgentRunStatus | null) => void;
}>) {
  if (rows.length === 0) {
    return (
      <TableEmptyState
        icon={<GitPullRequestArrow className='size-5' />}
        title='No AgentOS runs'
        description='AgentRunArtifact records will appear here after a workflow emits them.'
      />
    );
  }

  return (
    <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
      {BOARD_STATUSES.map(status => {
        const laneRows = rows.filter(artifact => artifact.status === status);

        const isDimmed = statusFilter !== null && statusFilter !== status;

        return (
          <section
            key={status}
            className={cn(
              'grid min-h-[150px] content-start gap-2 border-subtle border-t pt-2 transition-opacity',
              isDimmed && 'opacity-40'
            )}
          >
            <div className='flex items-center justify-between gap-2 px-1'>
              <p className='text-[12px] font-[560] text-primary-token'>
                {RUN_STATUS_LABEL[status]}
              </p>
              <button
                type='button'
                onClick={() =>
                  onStatusFilterChange(statusFilter === status ? null : status)
                }
                aria-pressed={statusFilter === status}
                aria-label={`Filter by ${RUN_STATUS_LABEL[status]} (${laneRows.length})`}
                className={cn(
                  'rounded px-1 text-[11px] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)',
                  statusFilter === status
                    ? 'bg-surface-0 font-[560] text-primary-token'
                    : 'text-tertiary-token hover:bg-surface-0 hover:text-secondary-token'
                )}
              >
                {laneRows.length}
              </button>
            </div>
            {laneRows.length > 0 ? (
              laneRows.map(artifact => (
                <AgentOsBoardCard
                  key={artifact.id}
                  artifact={artifact}
                  isSelected={artifact.id === selectedId}
                  onSelect={onSelect}
                />
              ))
            ) : (
              <p className='px-2.5 py-2 text-[12px] leading-5 text-tertiary-token'>
                No runs.
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function renderRunCell({ row }: CellContext<AgentRunArtifact, unknown>) {
  const artifact = row.original;

  return (
    <div className='min-w-0'>
      <p className='truncate text-[13px] font-[560] text-primary-token'>
        {artifact.title}
      </p>
      <p className='mt-1 line-clamp-2 text-[11.5px] leading-4 text-tertiary-token'>
        {artifact.summary}
      </p>
    </div>
  );
}

function renderStatusCell({ row }: CellContext<AgentRunArtifact, unknown>) {
  return <WorkflowStatusPill status={row.original.status} />;
}

function renderRouteCell({ row }: CellContext<AgentRunArtifact, unknown>) {
  return (
    <div className='grid gap-1 text-[11.5px] text-secondary-token'>
      <span className='truncate font-[520] text-primary-token'>
        {row.original.modelRoute}
      </span>
      <span className='truncate text-tertiary-token'>
        {row.original.source}
      </span>
    </div>
  );
}

function renderGateCell({ row }: CellContext<AgentRunArtifact, unknown>) {
  return (
    <span className='text-[12px] font-[540] text-primary-token tabular-nums'>
      {countPassedRequiredGates(row.original)}
    </span>
  );
}

function renderHumanGateCell({ row }: CellContext<AgentRunArtifact, unknown>) {
  if (!row.original.humanApprovalRequired) {
    return (
      <span className='text-[12px] text-tertiary-token'>Not required</span>
    );
  }
  const humanGateBadge = HUMAN_GATE_BADGES[row.original.humanGate.status];

  return (
    <Badge variant={humanGateBadge.variant} size='sm'>
      {humanGateBadge.label}
    </Badge>
  );
}

const AGENT_OS_COLUMNS: ColumnDef<AgentRunArtifact, unknown>[] = [
  columnHelper.display({
    id: 'run',
    header: 'Run',
    cell: renderRunCell,
    size: 300,
    meta: { className: 'min-w-[240px]' },
  }),
  columnHelper.display({
    id: 'status',
    header: 'Status',
    cell: renderStatusCell,
    size: 90,
  }),
  columnHelper.display({
    id: 'route',
    header: 'Route',
    cell: renderRouteCell,
    size: 120,
  }),
  columnHelper.display({
    id: 'gates',
    header: 'Gates',
    cell: renderGateCell,
    size: 80,
  }),
  columnHelper.display({
    id: 'humanGate',
    header: 'Approval',
    cell: renderHumanGateCell,
    size: 140,
  }),
];

function getRowClassName(artifact: AgentRunArtifact) {
  const hover = rowState.hover;
  return artifact.status === 'blocked' || artifact.status === 'failed'
    ? `group bg-surface-0 ${hover}`
    : `group ${hover}`;
}

function ViewModeButton({
  mode,
  activeMode,
  onSelect,
  icon,
  label,
}: Readonly<{
  readonly mode: AgentOsViewMode;
  readonly activeMode: AgentOsViewMode;
  readonly onSelect: (mode: AgentOsViewMode) => void;
  readonly icon: ReactNode;
  readonly label: string;
}>) {
  const isActive = mode === activeMode;

  return (
    <button
      type='button'
      onClick={() => onSelect(mode)}
      aria-pressed={isActive}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-[520] transition-colors',
        isActive
          ? 'bg-surface-0 text-primary-token'
          : 'text-tertiary-token hover:bg-surface-0 hover:text-secondary-token'
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface AgentOsRunsPanelProps {
  readonly artifacts: readonly AgentRunArtifact[];
  readonly deploymentsPanel?: ReactNode;
  readonly summary?: ReactNode;
  readonly status?: ReactNode;
}

export function AgentOsRunsPanel({
  artifacts,
  deploymentsPanel,
  summary,
  status,
}: AgentOsRunsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    artifacts[0]?.id ?? null
  );
  const [viewMode, setViewMode] = useState<AgentOsViewMode>('board');
  const [statusFilter, setStatusFilter] = useState<AgentRunStatus | null>(null);
  const columns = useMemo<ColumnDef<AgentRunArtifact, unknown>[]>(
    () => AGENT_OS_COLUMNS,
    []
  );
  const rows = useMemo(() => [...artifacts], [artifacts]);
  const selectedArtifact =
    selectedId === null
      ? null
      : (rows.find(artifact => artifact.id === selectedId) ?? null);

  useEffect(() => {
    const nextSelectedId = rows[0]?.id ?? null;
    const selectedIdStillExists = rows.some(
      artifact => artifact.id === selectedId
    );

    if (!selectedIdStillExists && selectedId !== nextSelectedId) {
      setSelectedId(nextSelectedId);
    }
  }, [rows, selectedId]);

  return (
    <ContentSurfaceCard
      surface='details'
      className='overflow-hidden'
      data-testid='agent-os-runs-panel'
    >
      <ContentSectionHeader
        title='AgentOS Runs'
        subtitle={
          summary ??
          (statusFilter
            ? `${RUN_STATUS_LABEL[statusFilter]} — ${rows.filter(a => a.status === statusFilter).length} of ${rows.length.toLocaleString('en-US')}`
            : `${rows.length.toLocaleString('en-US')} artifact${rows.length === 1 ? '' : 's'}`)
        }
        actions={
          <div className='flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:justify-end'>
            {status}
            <div className='inline-flex rounded-lg border border-subtle bg-surface-1 p-0.5'>
              <ViewModeButton
                mode='board'
                activeMode={viewMode}
                onSelect={setViewMode}
                icon={<LayoutGrid className='size-3.5' aria-hidden='true' />}
                label='Board'
              />
              <ViewModeButton
                mode='table'
                activeMode={viewMode}
                onSelect={setViewMode}
                icon={<Table2 className='size-3.5' aria-hidden='true' />}
                label='Table'
              />
            </div>
            <div className='hidden items-center gap-1.5 text-[11px] text-tertiary-token lg:flex'>
              <Bot className='size-3.5' aria-hidden='true' />
              WDK fixture
            </div>
          </div>
        }
        className='min-h-0 flex-col items-start px-(--linear-app-header-padding-x) py-3 sm:flex-row sm:items-center'
        bodyClassName='w-full'
        subtitleClassName='whitespace-normal'
        actionsClassName='ml-0 w-full max-w-full flex-wrap justify-start sm:ml-auto sm:w-auto sm:justify-end'
      />

      <div
        className={cn(
          'grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]',
          deploymentsPanel
            ? '2xl:grid-cols-[minmax(0,1fr)_520px_360px]'
            : '2xl:grid-cols-[minmax(0,1fr)_360px]'
        )}
      >
        <div className='min-w-0'>
          {viewMode === 'board' ? (
            <AgentOsBoard
              rows={rows}
              selectedId={selectedArtifact?.id ?? null}
              onSelect={artifact => setSelectedId(artifact.id)}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          ) : (
            <div className='min-w-0 rounded-lg border border-subtle bg-(--linear-app-content-surface)'>
              <AdminDataTable
                data={rows}
                columns={columns}
                isLoading={false}
                emptyState={
                  <TableEmptyState
                    icon={<GitPullRequestArrow className='size-5' />}
                    title='No AgentOS runs'
                    description='AgentRunArtifact records will appear here after a workflow emits them.'
                  />
                }
                getRowId={artifact => artifact.id}
                onRowClick={artifact => setSelectedId(artifact.id)}
                getRowClassName={artifact =>
                  cn(
                    getRowClassName(artifact),
                    artifact.id === selectedArtifact?.id &&
                      'bg-surface-0 ring-1 ring-inset ring-(--linear-border-focus)'
                  )
                }
                getRowTestId={artifact => `agent-os-run-${artifact.id}`}
                enableVirtualization={false}
                minWidth='700px'
                containerClassName='max-h-[460px]'
              />
            </div>
          )}
        </div>

        {deploymentsPanel ? (
          <div className='grid content-start gap-3 md:col-start-2 md:row-start-1 2xl:col-start-auto 2xl:row-start-auto'>
            {deploymentsPanel}
          </div>
        ) : null}

        <div
          className={cn(
            'grid content-start gap-3 md:col-start-2 2xl:sticky 2xl:top-3 2xl:col-start-auto 2xl:row-start-auto',
            deploymentsPanel ? 'md:row-start-2' : 'md:row-start-1'
          )}
        >
          <ApprovalQueuePanel
            artifacts={rows}
            selectedId={selectedArtifact?.id ?? null}
            onSelect={artifact => setSelectedId(artifact.id)}
          />
          <ArtifactDrawer artifact={selectedArtifact} />
        </div>
      </div>
    </ContentSurfaceCard>
  );
}
