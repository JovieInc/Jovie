import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AppShellFrame, type AppShellFrameVariant } from './AppShellFrame';

const NAV_ITEMS = [
  { key: 'nav-inbox', width: '60%' },
  { key: 'nav-issues', width: '75%' },
  { key: 'nav-views', width: '90%' },
  { key: 'nav-projects', width: '60%' },
  { key: 'nav-cycles', width: '75%' },
  { key: 'nav-teams', width: '90%' },
];

const NAV_ITEMS_2 = [
  { key: 'nav-settings', width: '50%' },
  { key: 'nav-help', width: '70%' },
  { key: 'nav-updates', width: '90%' },
  { key: 'nav-docs', width: '50%' },
];

function DefaultSidebarSkeleton({
  isShellChatV1,
}: {
  readonly isShellChatV1: boolean;
}) {
  return (
    <div
      // Shell V1 mirrors the production sidebar token width (244px) and the
      // compact header height so the post-resolve UnifiedSidebar slots in
      // without a width/header reflow.
      className={cn(
        'max-lg:hidden bg-sidebar lg:flex lg:shrink-0 lg:flex-col',
        isShellChatV1 ? 'lg:w-(--app-shell-sidebar-width)' : 'lg:w-58'
      )}
    >
      <div
        className={cn(
          'flex items-center gap-2 px-2.5',
          isShellChatV1
            ? 'h-(--app-shell-header-height-compact) py-0.5'
            : 'h-9 pt-2'
        )}
      >
        <div className='skeleton h-6 w-6 rounded-md' />
        <div className='skeleton h-4 w-24 rounded' />
      </div>

      <div
        className={cn(
          'flex-1 space-y-1',
          isShellChatV1 ? 'px-2.5 pt-1.5' : 'px-2 pt-4'
        )}
      >
        {NAV_ITEMS.map(item => (
          <div
            key={item.key}
            className='flex h-7 items-center gap-2 rounded-md px-1.5'
          >
            <div className='skeleton h-3.5 w-3.5 shrink-0 rounded' />
            <div
              className='skeleton h-3 rounded'
              style={{ width: item.width }}
            />
          </div>
        ))}

        <div className='pb-1 pt-3'>
          <div className='skeleton ml-1.5 h-3 w-16 rounded' />
        </div>

        {NAV_ITEMS_2.map(item => (
          <div
            key={item.key}
            className='flex h-7 items-center gap-2 rounded-md px-1.5'
          >
            <div className='skeleton h-3.5 w-3.5 shrink-0 rounded' />
            <div
              className='skeleton h-3 rounded'
              style={{ width: item.width }}
            />
          </div>
        ))}
      </div>

      <div
        className={cn(
          'flex items-center gap-2 pb-2 pt-1',
          isShellChatV1 ? 'px-2.5' : 'px-2'
        )}
      >
        <div className='skeleton h-7 w-7 shrink-0 rounded-full' />
        <div className='skeleton h-3 w-20 rounded' />
      </div>
    </div>
  );
}

export function AppShellSkeleton({
  main: mainOverride,
  audioPlayer,
  variant,
  sidebar: sidebarOverride,
}: {
  readonly main?: ReactNode;
  readonly audioPlayer?: ReactNode;
  /**
   * Match the AppShellFrame variant the post-skeleton render will use so the
   * Suspense fallback doesn't flash a different layout while data loads.
   * Defaults to 'legacy' to match the production default state.
   */
  readonly variant?: AppShellFrameVariant;
  /**
   * Override the sidebar skeleton. Pass `null` for unauthenticated onboarding
   * surfaces (e.g. /start) that intentionally render without sidebar.
   * Undefined falls back to the standard nav skeleton.
   */
  readonly sidebar?: ReactNode | null;
} = {}) {
  const isShellChatV1 = variant === 'shellChatV1';

  const resolvedSidebar =
    sidebarOverride !== undefined ? (
      sidebarOverride
    ) : (
      <DefaultSidebarSkeleton isShellChatV1={isShellChatV1} />
    );

  return (
    <AppShellFrame
      variant={variant}
      sidebar={resolvedSidebar}
      header={
        <header
          // Shell V1 header sits on the rounded content surface — no border-b,
          // matches the compact header token used by DashboardHeader so the
          // Suspense fallback doesn't shift the breadcrumb down a row.
          className={cn(
            'flex shrink-0 items-center gap-2',
            isShellChatV1
              ? 'h-(--app-shell-header-height-compact) bg-(--app-shell-content-surface) px-2.5'
              : 'h-12 border-b border-subtle px-4'
          )}
        >
          <div className='skeleton h-4 w-20 rounded' />
          <div className='skeleton h-4 w-4 rounded opacity-30' />
          <div className='skeleton h-4 w-28 rounded' />
        </header>
      }
      audioPlayer={audioPlayer}
      main={
        mainOverride ?? (
          <div className='mx-auto flex h-full w-full max-w-5xl p-4 sm:p-6'>
            <div className='w-full space-y-4 p-1 sm:p-2'>
              <div className='flex items-center justify-between'>
                <div className='space-y-2'>
                  <div className='skeleton h-6 w-52 rounded-md' />
                  <div className='skeleton h-4 w-72 rounded' />
                </div>
                <div className='skeleton h-9 w-28 rounded-md' />
              </div>

              <div className='space-y-2 rounded-xl bg-surface-0 p-2.5'>
                <div className='grid grid-cols-[minmax(0,1.4fr)_110px_68px] gap-3 border-b border-subtle/60 pb-2'>
                  <div className='skeleton h-3 w-24 rounded' />
                  <div className='skeleton h-3 w-16 rounded' />
                  <div className='skeleton h-3 w-12 rounded' />
                </div>
                {[1, 2, 3, 4, 5].map(row => (
                  <div
                    key={`app-shell-row-${row}`}
                    className='grid grid-cols-[minmax(0,1.4fr)_110px_68px] items-center gap-3 py-1'
                  >
                    <div className='skeleton h-4 w-full rounded' />
                    <div className='skeleton h-4 w-20 rounded' />
                    <div className='skeleton h-4 w-12 rounded' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
      }
    />
  );
}
