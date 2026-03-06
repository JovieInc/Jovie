'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AudienceTableProvider } from '@/components/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
import {
  renderIntentScoreCell,
  renderLastActionCell,
  renderLtvCell,
  renderReturningCell,
  renderSourceCell,
  renderUserCell,
} from '@/components/dashboard/organisms/dashboard-audience-table/utils/column-renderers';
import { UnifiedTable } from '@/components/organisms/table';
import type { AudienceMember } from '@/types';
import { DEMO_AUDIENCE_MEMBERS } from './mock-release-data';

const columnHelper = createColumnHelper<AudienceMember>();

/**
 * Subset of real audience columns for the demo — excludes Select, QuickActions,
 * and Menu columns that require hooks/API interactions.
 */
// biome-ignore lint/suspicious/noExplicitAny: TanStack Table ColumnDef requires `any` for mixed accessor types
const DEMO_COLUMNS: ColumnDef<AudienceMember, any>[] = [
  columnHelper.accessor('displayName', {
    id: 'user',
    header: 'Visitor',
    cell: renderUserCell,
    size: 220,
  }),
  columnHelper.accessor('intentLevel', {
    id: 'intentScore',
    header: 'Intent',
    cell: renderIntentScoreCell,
    size: 110,
  }),
  columnHelper.accessor('tipAmountTotalCents', {
    id: 'ltv',
    header: 'LTV',
    cell: renderLtvCell,
    size: 80,
  }),
  columnHelper.accessor('visits', {
    id: 'returning',
    header: 'Returning',
    cell: renderReturningCell,
    size: 100,
  }),
  columnHelper.accessor('referrerHistory', {
    id: 'source',
    header: 'Source',
    cell: renderSourceCell,
    size: 140,
  }),
  columnHelper.accessor('latestActions', {
    id: 'lastAction',
    header: 'Last Action',
    cell: renderLastActionCell,
    size: 160,
  }),
];

/**
 * Demo audience panel using the real UnifiedTable + real column renderers
 * with 54 mock AudienceMember entries.
 */
export function DemoRealAudiencePanel() {
  const [selectedIds] = useState(() => new Set<string>());

  const toggleSelect = useCallback(() => {}, []);
  const noop = useCallback(() => {}, []);
  const noopMember = useCallback((_m: AudienceMember) => {}, []);
  const getContextMenuItems = useCallback(() => [] as never[], []);
  const getTouringCity = useCallback(() => null, []);

  const contextValue = useMemo(
    () => ({
      selectedIds,
      toggleSelect,
      openMenuRowId: null,
      setOpenMenuRowId: noop as (id: string | null) => void,
      getContextMenuItems,
      onExportMember: noopMember,
      onBlockMember: noopMember,
      onViewProfile: noopMember,
      onSendNotification: noopMember,
      getTouringCity,
    }),
    [
      selectedIds,
      toggleSelect,
      noop,
      noopMember,
      getContextMenuItems,
      getTouringCity,
    ]
  );

  const handleRowClick = useCallback((member: AudienceMember) => {
    toast.info(`Viewing ${member.displayName ?? 'visitor'} (demo)`);
  }, []);

  const getRowId = useCallback((row: AudienceMember) => row.id, []);

  return (
    <AudienceTableProvider value={contextValue}>
      <div
        className='flex h-full min-h-0 flex-col'
        data-testid='demo-audience-table'
      >
        {/* Summary bar */}
        <div className='flex items-center gap-4 border-b border-subtle px-4 py-2 text-[13px]'>
          <span className='font-medium text-primary-token'>
            {DEMO_AUDIENCE_MEMBERS.length} visitors
          </span>
          <span className='text-tertiary-token'>
            {DEMO_AUDIENCE_MEMBERS.filter(m => m.intentLevel === 'high').length}{' '}
            high intent
          </span>
          <span className='text-tertiary-token'>
            {DEMO_AUDIENCE_MEMBERS.filter(m => m.email).length} with email
          </span>
        </div>

        {/* Real table */}
        <div className='flex-1 min-h-0'>
          <UnifiedTable
            data={DEMO_AUDIENCE_MEMBERS}
            columns={DEMO_COLUMNS}
            isLoading={false}
            getRowId={getRowId}
            enableVirtualization
            enableKeyboardNavigation
            className='text-[13px]'
            onRowClick={handleRowClick}
          />
        </div>
      </div>
    </AudienceTableProvider>
  );
}
