'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
} from '@/components/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
import { UnifiedTable } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { DemoAnalyticsSidebar } from './DemoAnalyticsSidebar';
import { DEMO_AUDIENCE_COLUMNS } from './demo-audience-columns';
import { DEMO_AUDIENCE_MEMBERS } from './mock-release-data';

/* ------------------------------------------------------------------ */
/*  DemoAudienceSection                                                 */
/* ------------------------------------------------------------------ */

export default function DemoAudienceSection() {
  const [selectedIds] = useState(() => new Set<string>());
  const [analyticsOpen, setAnalyticsOpen] = useState(false);

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

  const getRowId = useCallback((row: AudienceMember) => row.id, []);

  return (
    <AudienceTableStableProvider value={stableContextValue}>
      <AudienceTableVolatileProvider value={volatileContextValue}>
        <div className='flex h-full min-h-0 flex-col bg-(--linear-bg-surface-0)'>
          {/* Summary bar */}
          <div className='flex items-center justify-between border-b border-(--linear-border-subtle) px-5 py-2.5'>
            <div className='flex items-center gap-4 text-[13px]'>
              <span className='font-medium text-(--linear-text-primary)'>
                {DEMO_AUDIENCE_MEMBERS.length} visitors
              </span>
              <span className='text-(--linear-text-tertiary)'>
                {
                  DEMO_AUDIENCE_MEMBERS.filter(m => m.intentLevel === 'high')
                    .length
                }{' '}
                high intent
              </span>
              <span className='text-(--linear-text-tertiary)'>
                {DEMO_AUDIENCE_MEMBERS.filter(m => m.email).length} with email
              </span>
            </div>
            <button
              type='button'
              onClick={() => setAnalyticsOpen(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                analyticsOpen
                  ? 'bg-(--linear-bg-surface-2) text-(--linear-text-primary)'
                  : 'text-(--linear-text-tertiary) hover:text-(--linear-text-secondary) hover:bg-(--linear-bg-hover)'
              )}
              aria-label='Toggle analytics panel'
            >
              <BarChart3 className='h-3.5 w-3.5' aria-hidden='true' />
              <span className='hidden sm:inline'>Analytics</span>
            </button>
          </div>

          {/* Table + optional sidebar */}
          <div className='flex flex-1 min-h-0'>
            <div className='flex-1 min-w-0'>
              <UnifiedTable
                data={DEMO_AUDIENCE_MEMBERS}
                columns={DEMO_AUDIENCE_COLUMNS}
                isLoading={false}
                getRowId={getRowId}
                enableVirtualization
                enableKeyboardNavigation
                className='text-[13px]'
              />
            </div>

            <DemoAnalyticsSidebar
              isOpen={analyticsOpen}
              onClose={() => setAnalyticsOpen(false)}
            />
          </div>
        </div>
      </AudienceTableVolatileProvider>
    </AudienceTableStableProvider>
  );
}
