'use client';

import { Badge } from '@jovie/ui';
import type { CellContext, ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import { Bot, GitPullRequestArrow } from 'lucide-react';
import { type ComponentProps, useEffect, useMemo, useState } from 'react';
import { ContentSectionHeader } from '@/components/molecules/ContentSectionHeader';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { TableEmptyState, UnifiedTable } from '@/components/organisms/table';
import type { AgentRunArtifact } from '@/lib/agent-os/artifact';
import { ApprovalQueuePanel } from './ApprovalQueuePanel';
import { ArtifactDrawer } from './ArtifactDrawer';
import { WorkflowRunRow } from './WorkflowRunRow';
import { WorkflowStatusPill } from './WorkflowStatusPill';

const columnHelper = createColumnHelper<AgentRunArtifact>();
type BadgeVariant = ComponentProps<typeof Badge>['variant'];

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
  return artifact.status === 'blocked' || artifact.status === 'failed'
    ? 'group bg-surface-0 hover:bg-(--linear-row-hover)'
    : 'group hover:bg-(--linear-row-hover)';
}

interface AgentOsRunsPanelProps {
  readonly artifacts: readonly AgentRunArtifact[];
}

export function AgentOsRunsPanel({ artifacts }: AgentOsRunsPanelProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    artifacts[0]?.id ?? null
  );
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
        subtitle={`${rows.length.toLocaleString('en-US')} artifact${rows.length === 1 ? '' : 's'}`}
        actions={
          <div className='flex items-center gap-2 text-[11px] text-tertiary-token'>
            <Bot className='size-3.5' aria-hidden='true' />
            WDK fixture
          </div>
        }
        className='min-h-0 px-(--linear-app-header-padding-x) py-3'
      />

      <div className='grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]'>
        <div className='hidden min-w-0 rounded-lg border border-subtle bg-(--linear-app-content-surface) md:block'>
          <UnifiedTable
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
            getRowClassName={getRowClassName}
            getRowTestId={artifact => `agent-os-run-${artifact.id}`}
            enableVirtualization={false}
            minWidth='700px'
            className='text-[12.5px] [&_thead_th]:py-1 [&_thead_th]:text-3xs [&_thead_th]:tracking-[0.07em]'
            containerClassName='max-h-[420px]'
          />
        </div>

        <div className='grid gap-2 md:hidden'>
          {rows.length > 0 ? (
            rows.map(artifact => (
              <WorkflowRunRow
                key={artifact.id}
                artifact={artifact}
                isSelected={artifact.id === selectedArtifact?.id}
                onSelect={item => setSelectedId(item.id)}
              />
            ))
          ) : (
            <TableEmptyState
              icon={<GitPullRequestArrow className='size-5' />}
              title='No AgentOS runs'
              description='AgentRunArtifact records will appear here after a workflow emits them.'
            />
          )}
        </div>

        <div className='grid content-start gap-4'>
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
