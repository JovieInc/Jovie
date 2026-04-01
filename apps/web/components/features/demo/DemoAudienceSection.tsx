'use client';

import { BarChart3 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { AppShellContentPanel } from '@/components/organisms/AppShellContentPanel';
import { UnifiedTable } from '@/components/organisms/table';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
} from '@/features/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
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
  const [analyticsOpen, setAnalyticsOpen] = useState(true);

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
      hiddenMetadataColumns: {
        location: false,
        engagement: false,
        lastSeen: false,
      },
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
        <AppShellContentPanel
          maxWidth='full'
          frame='none'
          contentPadding='none'
          scroll='panel'
          className='overflow-hidden'
          data-testid='demo-audience-shell'
        >
          {/* Summary bar */}
          <div className='flex items-center justify-between border-b border-[color-mix(in_oklab,var(--linear-app-shell-border)_72%,transparent)] px-4 py-2'>
            <div className='flex items-center gap-4 text-[12.5px]'>
              <span className='font-[510] text-primary-token'>
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
            <button
              type='button'
              onClick={() => setAnalyticsOpen(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1.5 text-[12px] font-[510] transition-[background-color,border-color,color,box-shadow]',
                analyticsOpen
                  ? 'border-[color-mix(in_oklab,var(--linear-app-shell-border)_90%,transparent)] bg-[color-mix(in_oklab,var(--linear-app-content-surface)_96%,white_4%)] text-primary-token shadow-[0_1px_1px_rgba(0,0,0,0.04),0_6px_12px_-10px_rgba(0,0,0,0.14)]'
                  : 'text-tertiary-token hover:border-subtle hover:bg-(--linear-bg-hover) hover:text-secondary-token'
              )}
              aria-label='Toggle analytics panel'
            >
              <BarChart3 className='h-3.5 w-3.5' aria-hidden='true' />
              <span className='max-sm:hidden sm:inline'>Analytics</span>
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
        </AppShellContentPanel>
      </AudienceTableVolatileProvider>
    </AudienceTableStableProvider>
  );
}
