'use client';

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { UnifiedTable } from '@/components/organisms/table';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
} from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
import type { AudienceMember } from '@/types';
import { DEMO_AUDIENCE_COLUMNS } from './demo-audience-columns';
import { DEMO_AUDIENCE_MEMBERS } from './mock-release-data';

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

  const stableContextValue = useMemo(
    () => ({
      toggleSelect,
      setOpenMenuRowId: noop as (id: string | null) => void,
      getContextMenuItems,
      onExportMember: noopMember,
      onBlockMember: noopMember,
      onViewProfile: noopMember,
      onSendNotification: noopMember,
      getTouringCity,
    }),
    [toggleSelect, noop, noopMember, getContextMenuItems, getTouringCity]
  );

  const volatileContextValue = useMemo(
    () => ({ selectedIds, openMenuRowId: null as string | null }),
    [selectedIds]
  );

  const handleRowClick = useCallback((member: AudienceMember) => {
    toast.info(`Viewing ${member.displayName ?? 'visitor'} (demo)`);
  }, []);

  const getRowId = useCallback((row: AudienceMember) => row.id, []);

  return (
    <AudienceTableStableProvider value={stableContextValue}>
      <AudienceTableVolatileProvider value={volatileContextValue}>
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
              {
                DEMO_AUDIENCE_MEMBERS.filter(m => m.intentLevel === 'high')
                  .length
              }{' '}
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
              columns={DEMO_AUDIENCE_COLUMNS}
              isLoading={false}
              getRowId={getRowId}
              enableVirtualization
              enableKeyboardNavigation
              className='text-[13px]'
              onRowClick={handleRowClick}
            />
          </div>
        </div>
      </AudienceTableVolatileProvider>
    </AudienceTableStableProvider>
  );
}
