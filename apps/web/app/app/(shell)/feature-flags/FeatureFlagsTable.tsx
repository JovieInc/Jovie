'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { PAGE_TOOLBAR_META_TEXT_CLASS } from '@/components/organisms/table';
import { AdminDataTable } from '@/features/admin/table/AdminDataTable';
import { AdminTableSubheader } from '@/features/admin/table/AdminTableHeader';
import { AdminTableShell } from '@/features/admin/table/AdminTableShell';
import { cn } from '@/lib/utils';
import type { FlagRow } from './page';

interface FeatureFlagsTableProps {
  readonly flags: FlagRow[];
}

function FeatureFlagStatePill({
  enabled,
}: Readonly<{ readonly enabled: boolean }>) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-full border px-2 text-[11.5px] font-medium',
        enabled
          ? 'border-cyan-400/20 bg-cyan-500/12 text-cyan-300'
          : 'border-subtle bg-surface-0 text-tertiary-token'
      )}
    >
      {enabled ? 'On' : 'Off'}
    </span>
  );
}

const FEATURE_FLAG_COLUMNS: ColumnDef<FlagRow, unknown>[] = [
  {
    id: 'name',
    accessorFn: row => row.name,
    header: 'Flag',
    cell: ({ getValue }) => (
      <span className='font-caption text-primary-token'>
        {String(getValue())}
      </span>
    ),
    size: 220,
    minSize: 160,
  },
  {
    id: 'enabled',
    accessorFn: row => row.enabled,
    header: 'State',
    cell: ({ getValue }) => (
      <FeatureFlagStatePill enabled={getValue() === true} />
    ),
    size: 72,
    minSize: 64,
  },
  {
    id: 'defaultValue',
    accessorFn: row => row.defaultValue,
    header: 'Default',
    cell: ({ getValue }) => (
      <span className='font-caption text-tertiary-token'>
        {getValue() === true ? 'On' : 'Off'}
      </span>
    ),
    size: 72,
    minSize: 64,
  },
];

export function FeatureFlagsTable({ flags }: Readonly<FeatureFlagsTableProps>) {
  const totalFlags = flags.length;

  return (
    <AdminTableShell
      testId='feature-flags-table'
      toolbar={
        <AdminTableSubheader
          start={
            <p className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              Environment-driven flags and current state.
            </p>
          }
          end={
            <p className={PAGE_TOOLBAR_META_TEXT_CLASS}>
              {totalFlags.toLocaleString()} flag{totalFlags === 1 ? '' : 's'}
            </p>
          }
        />
      }
    >
      {() => (
        <AdminDataTable
          data={flags}
          columns={FEATURE_FLAG_COLUMNS}
          getRowId={row => row.name}
          enableVirtualization={false}
          minWidth='100%'
          containerClassName='flex-1'
        />
      )}
    </AdminTableShell>
  );
}
