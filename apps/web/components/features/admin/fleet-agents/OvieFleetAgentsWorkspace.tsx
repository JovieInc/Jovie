'use client';

import { UserAvatar } from '@jovie/ui';
import { useCallback, useMemo, useState } from 'react';
import { HudStatusPill } from '@/app/app/(shell)/admin/ops/HudStatusPill';
import { PageShell } from '@/components/organisms/PageShell';
import { rowState } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { useRegisterRightPanel } from '@/hooks/useRegisterRightPanel';
import type { FleetAgentTableRow } from '@/lib/ovie/fleet-agents';
import { type ColumnDef, createColumnHelper } from '@/lib/tanstack-table';
import { cn } from '@/lib/utils';
import { FleetAgentRail } from './FleetAgentRail';

// biome-ignore lint/suspicious/noExplicitAny: matches AdminDataTable legacy column helper typing
type FleetAgentColumn = ColumnDef<FleetAgentTableRow, any>;

const columnHelper = createColumnHelper<FleetAgentTableRow>();

const STATUS_LABEL: Record<FleetAgentTableRow['status'], string> = {
  live: 'Live',
  degraded: 'Degraded',
  draft: 'Draft',
};

function statusTone(
  status: FleetAgentTableRow['status']
): 'good' | 'warning' | 'bad' | 'neutral' {
  if (status === 'live') return 'good';
  if (status === 'degraded') return 'warning';
  return 'neutral';
}

function buildColumns(
  displayNames: Readonly<Record<string, string>>
): FleetAgentColumn[] {
  return [
    columnHelper.display({
      id: 'agent',
      header: 'Agent',
      cell: ({ row }) => {
        const name =
          displayNames[row.original.id] ?? row.original.defaultDisplayName;
        return (
          <span className='flex min-w-0 items-center gap-2'>
            <UserAvatar name={name} size='sm' />
            <span className='min-w-0 truncate text-app font-medium text-primary-token'>
              {name}
            </span>
          </span>
        );
      },
    }),
    columnHelper.accessor('status', {
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue() as FleetAgentTableRow['status'];
        return (
          <HudStatusPill
            label={STATUS_LABEL[status]}
            tone={statusTone(status)}
          />
        );
      },
    }),
    columnHelper.accessor('readinessSummary', {
      header: 'Readiness',
      cell: ({ getValue }) => (
        <span className='text-xs text-secondary-token'>{getValue()}</span>
      ),
    }),
    columnHelper.accessor('role', {
      header: 'Lane',
      cell: ({ getValue }) => (
        <span className='max-w-48 truncate text-xs text-tertiary-token'>
          {getValue()}
        </span>
      ),
    }),
  ];
}

export interface OvieFleetAgentsWorkspaceProps {
  readonly rows: readonly FleetAgentTableRow[];
}

export function OvieFleetAgentsWorkspace({
  rows,
}: OvieFleetAgentsWorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(
    rows[0]?.id ?? null
  );
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [displayNames, setDisplayNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map(row => [row.id, row.defaultDisplayName]))
  );

  const selected = useMemo(
    () => rows.find(row => row.id === selectedId) ?? null,
    [rows, selectedId]
  );

  const displayName = selected
    ? (displayNames[selected.id] ?? selected.defaultDisplayName)
    : '';

  const onDisplayNameChange = useCallback(
    (name: string) => {
      if (!selected) return;
      setDisplayNames(current => ({ ...current, [selected.id]: name }));
    },
    [selected]
  );

  const columns = useMemo(() => buildColumns(displayNames), [displayNames]);

  const getRowClassName = useCallback(
    (row: FleetAgentTableRow) =>
      row.id === selectedId
        ? `group cursor-pointer ${rowState.selected}`
        : `group cursor-pointer ${rowState.hover}`,
    [selectedId]
  );

  const rail = useMemo(
    () => (
      <FleetAgentRail
        row={selected}
        displayName={displayName}
        onDisplayNameChange={onDisplayNameChange}
        onClose={() => setSelectedId(null)}
      />
    ),
    [displayName, onDisplayNameChange, selected]
  );
  useRegisterRightPanel(rail);

  return (
    <PageShell className='min-h-0 flex-1'>
      <AdminTableShell testId='ovie-fleet-agents-table'>
        {() => (
          <AdminDataTable
            data={[...rows]}
            columns={columns}
            minWidth='520px'
            getRowId={row => row.id}
            getRowClassName={getRowClassName}
            getRowTestId={row => `fleet-agent-row-${row.id}`}
            onRowClick={row => {
              setSelectedId(row.id);
              setFocusedIndex(rows.findIndex(entry => entry.id === row.id));
            }}
            focusedRowIndex={focusedIndex}
            onFocusedRowChange={index => {
              setFocusedIndex(index);
              setSelectedId(rows[index]?.id ?? null);
            }}
          />
        )}
      </AdminTableShell>
      <p
        className={cn(
          'border-t border-(--app-shell-frame-seam) px-3 py-1.5 text-2xs text-tertiary-token'
        )}
      >
        Roster source: fleet-room contract until agent profiles persist in Neon.
      </p>
    </PageShell>
  );
}
