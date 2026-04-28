import type { ReactNode } from 'react';
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

export function AppShellSkeleton({
  main: mainOverride,
  variant,
}: {
  readonly main?: ReactNode;
  /**
   * Match the AppShellFrame variant the post-skeleton render will use so the
   * Suspense fallback doesn't flash a different layout while data loads.
   * Defaults to 'legacy' to match the production default state.
   */
  readonly variant?: AppShellFrameVariant;
} = {}) {
  return (
    <AppShellFrame
      variant={variant}
      sidebar={
        <div className='max-lg:hidden bg-sidebar lg:flex lg:w-[232px] lg:shrink-0 lg:flex-col'>
          <div className='flex h-9 items-center gap-2 px-2 pt-2'>
            <div className='skeleton h-6 w-6 rounded-md' />
            <div className='skeleton h-4 w-24 rounded' />
          </div>

          <div className='flex-1 space-y-1 px-2 pt-4'>
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

          <div className='flex items-center gap-2 px-2 pb-2 pt-1'>
            <div className='skeleton h-7 w-7 shrink-0 rounded-full' />
            <div className='skeleton h-3 w-20 rounded' />
          </div>
        </div>
      }
      header={
        <header className='flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-4'>
          <div className='skeleton h-4 w-20 rounded' />
          <div className='skeleton h-4 w-4 rounded opacity-30' />
          <div className='skeleton h-4 w-28 rounded' />
        </header>
      }
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
