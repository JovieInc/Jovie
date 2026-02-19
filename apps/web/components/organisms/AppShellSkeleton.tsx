import { BrandLogo } from '@/components/atoms/BrandLogo';

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

/**
 * Static skeleton of the app shell (sidebar + header + content area).
 * Used as the loading state before the full AuthShell mounts to prevent layout shift.
 *
 * Mirrors the exact structure of AuthShell:
 * - Left sidebar with nav skeleton
 * - Right content area with header bar + centered loader
 */
export function AppShellSkeleton() {
  return (
    <div className='flex h-svh w-full overflow-hidden bg-base [--sidebar-width:232px]'>
      {/* Sidebar skeleton — matches sidebar width and bg */}
      <div className='hidden lg:flex lg:shrink-0 lg:w-(--sidebar-width) lg:flex-col bg-sidebar'>
        {/* Sidebar header skeleton */}
        <div className='flex h-9 items-center gap-2 px-2 pt-2'>
          <div className='skeleton h-6 w-6 rounded-md' />
          <div className='skeleton h-4 w-24 rounded' />
        </div>

        {/* Sidebar nav skeleton */}
        <div className='flex-1 px-2 pt-4 space-y-1'>
          {NAV_ITEMS.map(item => (
            <div
              key={item.key}
              className='flex items-center gap-2 h-7 px-1.5 rounded-[6px]'
            >
              <div className='skeleton h-3.5 w-3.5 rounded shrink-0' />
              <div
                className='skeleton h-3 rounded'
                style={{ width: item.width }}
              />
            </div>
          ))}

          {/* Section label */}
          <div className='pt-3 pb-1'>
            <div className='skeleton h-3 w-16 rounded ml-1.5' />
          </div>

          {NAV_ITEMS_2.map(item => (
            <div
              key={item.key}
              className='flex items-center gap-2 h-7 px-1.5 rounded-[6px]'
            >
              <div className='skeleton h-3.5 w-3.5 rounded shrink-0' />
              <div
                className='skeleton h-3 rounded'
                style={{ width: item.width }}
              />
            </div>
          ))}
        </div>

        {/* Sidebar footer skeleton (user button) */}
        <div className='flex items-center gap-2 px-2 pb-2 pt-1'>
          <div className='skeleton h-7 w-7 rounded-full shrink-0' />
          <div className='skeleton h-3 w-20 rounded' />
        </div>
      </div>

      {/* Main content area */}
      <div className='flex-1 flex flex-col bg-surface-1 lg:border-[0.5px] lg:border-default lg:rounded-[4px_4px_12px_4px] lg:m-2 lg:ml-0'>
        {/* Header skeleton */}
        <header className='flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-4'>
          <div className='skeleton h-4 w-20 rounded' />
          <div className='skeleton h-4 w-4 rounded opacity-30' />
          <div className='skeleton h-4 w-28 rounded' />
        </header>

        {/* Content area — centered logo loader */}
        <div className='flex-1 flex items-center justify-center'>
          <div className='flex flex-col items-center gap-3'>
            <BrandLogo
              size={32}
              tone='auto'
              alt='Loading'
              className='animate-pulse'
              aria-hidden
            />
            <p className='text-xs text-tertiary-token'>Loading...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
