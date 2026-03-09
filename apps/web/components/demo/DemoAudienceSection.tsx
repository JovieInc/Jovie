'use client';

import { type ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { BarChart3 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  AudienceTableStableProvider,
  AudienceTableVolatileProvider,
} from '@/components/dashboard/organisms/dashboard-audience-table/AudienceTableContext';
import {
  renderIntentScoreCell,
  renderLastActionCell,
  renderLtvCell,
  renderReturningCell,
  renderSourceCell,
  renderUserCell,
} from '@/components/dashboard/organisms/dashboard-audience-table/utils/column-renderers';
import { UnifiedTable } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { AudienceMember } from '@/types';
import { DemoAnalyticsSidebar } from './DemoAnalyticsSidebar';
import { DEMO_AUDIENCE_MEMBERS } from './mock-release-data';

/* ------------------------------------------------------------------ */
/*  Column definitions (same as DemoRealAudiencePanel)                  */
/* ------------------------------------------------------------------ */

const columnHelper = createColumnHelper<AudienceMember>();

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
        <div className='flex h-full min-h-0 flex-col bg-[var(--linear-bg-surface-0)]'>
          {/* Summary bar */}
          <div className='flex items-center justify-between border-b border-[var(--linear-border-subtle)] px-5 py-2.5'>
            <div className='flex items-center gap-4 text-[13px]'>
              <span className='font-medium text-[var(--linear-text-primary)]'>
                {DEMO_AUDIENCE_MEMBERS.length} visitors
              </span>
              <span className='text-[var(--linear-text-tertiary)]'>
                {
                  DEMO_AUDIENCE_MEMBERS.filter(m => m.intentLevel === 'high')
                    .length
                }{' '}
                high intent
              </span>
              <span className='text-[var(--linear-text-tertiary)]'>
                {DEMO_AUDIENCE_MEMBERS.filter(m => m.email).length} with email
              </span>
            </div>
            <button
              type='button'
              onClick={() => setAnalyticsOpen(prev => !prev)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors',
                analyticsOpen
                  ? 'bg-[var(--linear-bg-surface-2)] text-[var(--linear-text-primary)]'
                  : 'text-[var(--linear-text-tertiary)] hover:text-[var(--linear-text-secondary)] hover:bg-[var(--linear-bg-hover)]'
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
                columns={DEMO_COLUMNS}
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
