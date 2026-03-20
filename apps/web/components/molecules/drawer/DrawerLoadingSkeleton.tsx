'use client';

import { RightDrawer } from '@/components/organisms/RightDrawer';
import { SIDEBAR_WIDTH } from '@/lib/constants/layout';

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
      <div className='flex h-full flex-col bg-surface-0'>
        <div className='sticky top-0 z-10 flex min-h-[36px] shrink-0 items-center justify-between bg-surface-0 px-2 py-1'>
          <div className='h-2.5 w-28 rounded skeleton' />
          <div className='flex items-center gap-px'>
            <div className='h-[24px] w-[24px] rounded-full skeleton' />
            <div className='h-[24px] w-[24px] rounded-full skeleton' />
          </div>
        </div>

        <div className='shrink-0 overflow-hidden px-2 pt-2 pb-1.5'>
          <div className='space-y-2'>
            <div className='flex items-start gap-3'>
              <div className='h-[72px] w-[72px] shrink-0 rounded-lg skeleton' />
              <div className='min-w-0 flex-1 space-y-1.5 pt-0.5'>
                <div className='h-4 w-2/3 rounded skeleton' />
                <div className='h-3 w-1/2 rounded skeleton' />
                <div className='h-3 w-5/6 rounded skeleton' />
                <div className='h-2.5 w-2/3 rounded skeleton' />
              </div>
            </div>

            <div className='h-[24px] w-full rounded-md skeleton' />

            <div className='grid grid-cols-2 divide-x divide-(--linear-app-frame-seam) p-1.5'>
              <div className='space-y-1'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-4.5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
              <div className='space-y-1 pl-2'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-4.5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
            </div>
          </div>
        </div>

        {showTabs ? (
          <div className='shrink-0 bg-surface-0 px-2 py-1'>
            <div className='flex w-full gap-1 rounded-(--linear-app-control-radius) bg-surface-1 p-0.5'>
              {['tab-1', 'tab-2', 'tab-3', 'tab-4'].map(tabId => (
                <div
                  key={tabId}
                  className='h-6 flex-1 rounded-[calc(var(--linear-app-control-radius)-1px)] skeleton'
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className='flex-1 space-y-2 overflow-hidden bg-(--linear-bg-surface-0) px-2 py-2'>
          {contentRowIds.map((rowId, index) => (
            <div
              key={rowId}
              className={
                index < 4
                  ? 'grid grid-cols-[76px_minmax(0,1fr)] items-center gap-2 rounded-md px-1.5 py-0.5'
                  : 'grid grid-cols-1 items-center gap-2 rounded-md px-1.5 py-0.5'
              }
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
