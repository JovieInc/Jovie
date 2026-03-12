'use client';

import { RightDrawer } from '@/components/organisms/RightDrawer';
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
      <div className='flex h-full flex-col bg-(--linear-app-drawer-surface)'>
        <div className='sticky top-0 z-10 flex min-h-[var(--linear-app-drawer-header-height)] shrink-0 items-center justify-between border-b border-(--linear-border-subtle) bg-(--linear-app-drawer-surface) px-[var(--linear-app-drawer-padding-x)] py-1'>
          <div className='h-2.5 w-28 rounded skeleton' />
          <div className='flex items-center gap-px'>
            <div className='h-[var(--linear-app-control-height-sm)] w-[var(--linear-app-control-height-sm)] rounded-[var(--linear-app-control-radius)] skeleton' />
            <div className='h-[var(--linear-app-control-height-sm)] w-[var(--linear-app-control-height-sm)] rounded-[var(--linear-app-control-radius)] skeleton' />
          </div>
        </div>

        <div className='shrink-0 overflow-hidden border-b border-(--linear-border-subtle) px-[var(--linear-app-drawer-padding-x)] pt-2.5 pb-2'>
          <div className='space-y-2'>
            <div className='flex items-start gap-2.5'>
              <div className='h-[72px] w-[72px] shrink-0 rounded-[10px] skeleton' />
              <div className='min-w-0 flex-1 space-y-1.5 pt-0.5'>
                <div className='h-4 w-2/3 rounded skeleton' />
                <div className='h-3 w-1/2 rounded skeleton' />
                <div className='h-3 w-5/6 rounded skeleton' />
                <div className='h-2.5 w-2/3 rounded skeleton' />
              </div>
            </div>

            <div className='h-[24px] w-full rounded-[7px] skeleton' />

            <div className='grid grid-cols-2 rounded-[9px] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]'>
              <div className='space-y-1'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-4.5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
              <div className='space-y-1 border-l border-(--linear-border-subtle) pl-2'>
                <div className='h-[10px] w-14 rounded skeleton' />
                <div className='h-4.5 w-10 rounded skeleton' />
                <div className='h-[11px] w-10 rounded skeleton' />
              </div>
            </div>
          </div>
        </div>

        {showTabs ? (
          <div className='shrink-0 border-b border-(--linear-border-subtle) bg-(--linear-app-drawer-surface) px-[var(--linear-app-drawer-padding-x)] py-1'>
            <div className='flex w-full gap-1 rounded-[var(--linear-app-control-radius)] border border-(--linear-border-subtle) bg-(--linear-bg-surface-1) p-0.5'>
              {['tab-1', 'tab-2', 'tab-3', 'tab-4'].map(tabId => (
                <div
                  key={tabId}
                  className='h-6 flex-1 rounded-[calc(var(--linear-app-control-radius)-1px)] skeleton'
                />
              ))}
            </div>
          </div>
        ) : null}

        <div className='flex-1 space-y-2.5 overflow-hidden bg-(--linear-app-drawer-surface) px-[var(--linear-app-drawer-padding-x)] py-2.5'>
          {contentRowIds.map((rowId, index) => (
            <div
              key={rowId}
              className={cn(
                'grid items-center gap-2 rounded-[7px] px-1.5 py-0.5',
                index < 4 ? 'grid-cols-[76px_minmax(0,1fr)]' : 'grid-cols-1'
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
                    <div className='h-7 w-full rounded-[8px] skeleton' />
                    <div className='h-7 w-full rounded-[8px] skeleton' />
                    <div className='h-7 w-4/5 rounded-[8px] skeleton' />
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
