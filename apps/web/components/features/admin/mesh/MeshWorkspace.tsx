'use client';

import { AlertTriangle, Network } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { toast } from '@/components/feedback';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import type { EntityStatusTone } from '@/components/organisms/entity-card';
import { statusDotVar } from '@/components/organisms/entity-card/kind-presets';
import { rowState, TableEmptyState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import type { MeshAgentSnapshot } from '@/lib/ovie/mesh/types';
import {
  getMeshPingErrorMessage,
  sendMeshPingRequest,
  useMeshReadQuery,
} from '@/lib/queries/useMeshQuery';
import type { CellContext, ColumnDef } from '@/lib/tanstack-table';
import { createColumnHelper } from '@/lib/tanstack-table';
import { MeshAgentRail } from './MeshAgentRail';

const columnHelper = createColumnHelper<MeshAgentSnapshot>();

function statusTone(status: MeshAgentSnapshot['status']): EntityStatusTone {
  if (status === 'live') return 'live';
  if (status === 'stale') return 'scheduled';
  return 'neutral';
}

function statusLabel(status: MeshAgentSnapshot['status']): string {
  if (status === 'live') return 'Active';
  if (status === 'stale') return 'Stale';
  return 'Unknown';
}

function renderStatusCell({ row }: CellContext<MeshAgentSnapshot, unknown>) {
  const agent = row.original;
  return (
    <span className='flex items-center gap-2 text-2xs text-secondary-token'>
      <span
        aria-hidden='true'
        className='size-2 rounded-full'
        style={{ background: statusDotVar(statusTone(agent.status)) }}
      />
      {statusLabel(agent.status)}
      <span className='sr-only'>{`Status: ${statusLabel(agent.status)}`}</span>
    </span>
  );
}

function renderAgentCell({ row }: CellContext<MeshAgentSnapshot, unknown>) {
  return (
    <div className='min-w-0'>
      <p className='truncate text-app font-[560] text-primary-token'>
        {row.original.label}
      </p>
      {row.original.waitingOnTim ? (
        <p
          className='mt-0.5 truncate text-2xs text-tertiary-token'
          data-testid='mesh-waiting-cell'
        >
          Waiting on Tim: {row.original.waitingOnTim}
        </p>
      ) : null}
    </div>
  );
}

function renderModeCell({ row }: CellContext<MeshAgentSnapshot, unknown>) {
  return (
    <span className='truncate text-2xs text-secondary-token'>
      {row.original.receiveMode}
    </span>
  );
}

function formatMeshColumnTimestamp(value: string | null): string {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

function renderTimestampCell(field: 'lastSentAt' | 'lastReceivedAt') {
  return ({ row }: CellContext<MeshAgentSnapshot, unknown>) => (
    <span className='truncate text-2xs tabular-nums text-secondary-token'>
      {formatMeshColumnTimestamp(row.original[field])}
    </span>
  );
}

function renderWaitingCell({ row }: CellContext<MeshAgentSnapshot, unknown>) {
  return (
    <span className='truncate text-2xs text-secondary-token'>
      {row.original.waitingOnTim ?? '—'}
    </span>
  );
}

const MESH_COLUMNS: ColumnDef<MeshAgentSnapshot, unknown>[] = [
  columnHelper.display({
    id: 'status',
    header: 'Status',
    cell: renderStatusCell,
    size: 100,
  }),
  columnHelper.display({
    id: 'agent',
    header: 'Agent',
    cell: renderAgentCell,
    size: 200,
  }),
  columnHelper.display({
    id: 'receiveMode',
    header: 'Receive mode',
    cell: renderModeCell,
    size: 110,
  }),
  columnHelper.display({
    id: 'lastSent',
    header: 'Last sent',
    cell: renderTimestampCell('lastSentAt'),
    size: 130,
  }),
  columnHelper.display({
    id: 'lastReceived',
    header: 'Last received',
    cell: renderTimestampCell('lastReceivedAt'),
    size: 130,
  }),
  columnHelper.display({
    id: 'waitingOnTim',
    header: 'Waiting on Tim',
    cell: renderWaitingCell,
    size: 140,
  }),
];

/**
 * Read-only mesh roster (JOV-8937): one row per agent, entity card in the
 * rail, and a capped owner-only ping. No mesh state is ever editable here.
 */
export function MeshWorkspace() {
  const query = useMeshReadQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pingPending, setPingPending] = useState(false);

  const agents = query.data?.agents ?? [];
  const selectedAgent = agents.find(agent => agent.id === selectedId) ?? null;

  const ping = (agentId: string) => {
    setPingPending(true);
    sendMeshPingRequest(agentId)
      .then(() => {
        toast.success('Mesh ping sent.');
        return void query.refetch();
      })
      .catch((error: unknown) => {
        toast.error(getMeshPingErrorMessage(error));
      })
      .finally(() => setPingPending(false));
  };

  let body: ReactNode;
  if (query.isError && !query.data) {
    body = (
      <TableEmptyState
        icon={<AlertTriangle className='h-5 w-5' aria-hidden='true' />}
        heading='Mesh unavailable'
        description='The mesh roster could not load.'
        variant='error'
        action={{ label: 'Retry', onClick: () => void query.refetch() }}
      />
    );
  } else {
    body = (
      <AdminDataTable
        data={agents}
        columns={MESH_COLUMNS}
        isLoading={query.isLoading}
        emptyState={
          <TableEmptyState
            icon={<Network className='size-5' aria-hidden='true' />}
            heading='No mesh agents'
            description='The mesh registry is empty.'
          />
        }
        getRowId={agent => agent.id}
        onRowClick={agent => setSelectedId(agent.id)}
        getRowTestId={agent => `mesh-row-${agent.id}`}
        getRowClassName={() => rowState.hover}
        enableVirtualization={false}
        minWidth='640px'
        containerClassName='max-h-115'
      />
    );
  }

  return (
    <AdminPage
      title='Mesh'
      layout='workspace'
      description='Agent mesh roster, read-only.'
      testId='admin-mesh-page'
      viewTestId='admin-mesh-view'
    >
      <ContentSurfaceCard
        surface='details'
        className='min-h-0 flex-1 overflow-hidden'
        data-testid='mesh-roster-panel'
      >
        {body}
      </ContentSurfaceCard>
      <MeshAgentRail
        agent={selectedAgent}
        isOpen={selectedAgent !== null}
        onClose={() => setSelectedId(null)}
        onPing={ping}
        pingPending={pingPending}
      />
    </AdminPage>
  );
}
