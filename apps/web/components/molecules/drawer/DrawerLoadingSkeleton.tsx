'use client';

import { RightDrawer } from '@/components/organisms/RightDrawer';
import { LINEAR_SURFACE } from '@/features/dashboard/tokens';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';
import { cn } from '@/lib/utils';

export interface DrawerLoadingSkeletonProps {
  readonly ariaLabel?: string;
  readonly width?: number;
  readonly showTabs?: boolean;
  readonly contentRows?: number;
  readonly className?: string;
}

export function DrawerLoadingSkeleton({
  ariaLabel = 'Loading details',
  width = SIDEBAR_WIDTH,
  showTabs = true,
  contentRows = 6,
  className,
}: DrawerLoadingSkeletonProps) {
  const contentRowIds = Array.from(
    { length: contentRows },
    (_, index) => `drawer-loading-row-${index + 1}`
  );

  return (
    <RightDrawer
      isOpen
      width={width}
      ariaLabel={ariaLabel}
      className={className}
    >
      <div
        className='flex h-full flex-col bg-surface-0'
        data-testid='drawer-loading-skeleton'
      >
        <div
          className={cn(
            'sticky top-0 z-10 flex min-h-[32px] shrink-0 items-center justify-between border-b border-(--linear-app-frame-seam) bg-surface-1 px-2 py-1 backdrop-blur-[10px]'
          )}
        >
          <div className='h-2.5 w-28 rounded skeleton' />
          <div className='flex items-center gap-px'>
            <div className='h-[24px] w-[24px] rounded-full skeleton' />
            <div className='h-[24px] w-[24px] rounded-full skeleton' />
          </div>
        </div>

        <div className='shrink-0 overflow-hidden px-3 pt-2.5 pb-1.5'>
          <div className='space-y-2.5'>
            <div
              className={cn(LINEAR_SURFACE.drawerCard, 'overflow-hidden p-3.5')}
              data-testid='drawer-loading-header-card'
            >
              <div className='mb-2 h-2.5 w-14 rounded skeleton' />
              <div className='flex items-start gap-3'>
                <div className='h-[72px] w-[72px] shrink-0 rounded-lg skeleton' />
                <div className='min-w-0 flex-1 space-y-1.5 pt-0.5'>
                  <div className='h-4 w-2/3 rounded skeleton' />
                  <div className='h-3 w-1/2 rounded skeleton' />
                  <div className='h-3 w-5/6 rounded skeleton' />
                  <div className='h-2.5 w-2/3 rounded skeleton' />
                </div>
              </div>
              <div className='mt-3 border-t border-(--linear-app-frame-seam) pt-2.5'>
                <div className='h-[24px] w-full rounded-md skeleton' />
              </div>
            </div>

            <div
              className={cn(LINEAR_SURFACE.drawerCard, 'overflow-hidden')}
              data-testid='drawer-loading-analytics-card'
            >
              <div className='border-b border-(--linear-app-frame-seam) px-3 py-2'>
                <div className='h-2.5 w-16 rounded skeleton' />
              </div>
              <div className='grid grid-cols-2 divide-x divide-(--linear-app-frame-seam) p-3'>
                <div className='space-y-1'>
                  <div className='h-[10px] w-14 rounded skeleton' />
                  <div className='h-4.5 w-10 rounded skeleton' />
                  <div className='h-[11px] w-10 rounded skeleton' />
                </div>
                <div className='space-y-1 pl-3'>
                  <div className='h-[10px] w-14 rounded skeleton' />
                  <div className='h-4.5 w-10 rounded skeleton' />
                  <div className='h-[11px] w-10 rounded skeleton' />
                </div>
              </div>
            </div>
          </div>
        </div>

        {showTabs ? (
          <div className='shrink-0 bg-surface-0 px-3 py-1'>
            <div
              className={cn(LINEAR_SURFACE.drawerCard, 'overflow-hidden p-2')}
              data-testid='drawer-loading-tabs-card'
            >
              <div className='flex w-full gap-1'>
                {['tab-1', 'tab-2', 'tab-3', 'tab-4'].map(tabId => (
                  <div
                    key={tabId}
                    className='h-[26px] flex-1 rounded-lg skeleton'
                  />
                ))}
              </div>
            </div>
          </div>
        ) : null}

        <div className='flex-1 space-y-2.5 overflow-hidden bg-(--linear-bg-surface-0) px-3 py-2.5'>
          {contentRowIds.map((rowId, index) => (
            <div
              key={rowId}
              data-testid='drawer-loading-content-row'
              className={cn(
                LINEAR_SURFACE.drawerCardSm,
                'items-center gap-2 px-3 py-2',
                index < 4
                  ? 'grid grid-cols-[76px_minmax(0,1fr)]'
                  : 'grid grid-cols-1'
              )}
            >
              {index < 4 ? (
                <>
                  <div className='h-2.5 w-12 rounded skeleton' />
                  <div className='h-3.5 w-full rounded skeleton' />
                </>
              ) : (
                <div className='space-y-1.5'>
                  <div className='h-2.5 w-24 rounded skeleton' />
                  <div className='space-y-1'>
                    <div className='h-7 w-full rounded-md skeleton' />
                    <div className='h-7 w-full rounded-md skeleton' />
                    <div className='h-7 w-4/5 rounded-md skeleton' />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </RightDrawer>
  );
}
