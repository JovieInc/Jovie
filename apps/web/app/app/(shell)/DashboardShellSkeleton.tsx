import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

/**
 * Streaming fallback for the dashboard shell.
 *
 * Renders immediately while DashboardShellContent resolves data.
 * Mimics the AppShellFrame layout (sidebar + header + content area)
 * so the user sees a recognizable shell shape at first byte.
 */
export function DashboardShellSkeleton() {
  return (
    <div
      className='flex h-svh w-full overflow-hidden bg-(--linear-bg-page) pt-[env(safe-area-inset-top)]'
      aria-busy='true'
      aria-live='polite'
      data-testid='dashboard-shell-skeleton'
    >
      {/* Sidebar skeleton */}
      <div className='hidden lg:flex w-[var(--sidebar-width,256px)] flex-col border-r border-(--linear-app-shell-sidebar-seam) bg-(--linear-bg-page) p-3 gap-4'>
        {/* Logo area */}
        <div className='flex items-center gap-2 px-2 py-1'>
          <LoadingSkeleton height='h-7' width='w-7' rounded='lg' />
          <LoadingSkeleton height='h-4' width='w-20' rounded='sm' />
        </div>

        {/* Nav items */}
        <div className='space-y-1.5 mt-2'>
          {[1, 2, 3, 4, 5].map(i => (
            <div
              key={`nav-${i}`}
              className='flex items-center gap-2.5 px-2 py-1.5'
            >
              <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
              <LoadingSkeleton
                height='h-3.5'
                width={i === 1 ? 'w-16' : i === 2 ? 'w-20' : 'w-14'}
                rounded='sm'
              />
            </div>
          ))}
        </div>
      </div>

      {/* Main content area */}
      <main className='flex min-h-0 min-w-0 flex-1 overflow-hidden bg-surface-0 lg:mt-[8px] lg:mr-[8px] lg:ml-px lg:rounded-t-[12px] lg:border lg:border-b-0 lg:border-(--linear-app-shell-border) lg:bg-(--linear-app-content-surface) lg:shadow-[var(--linear-app-shell-shadow)]'>
        <div className='flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden'>
          {/* Header skeleton */}
          <div className='flex h-12 items-center gap-3 border-b border-(--linear-app-frame-seam) px-4'>
            <LoadingSkeleton height='h-4' width='w-32' rounded='sm' />
            <div className='flex-1' />
            <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
          </div>

          {/* Content skeleton */}
          <div className='flex-1 min-h-0 min-w-0 overflow-hidden flex items-center justify-center'>
            <div className='w-full max-w-2xl px-4 space-y-6'>
              <div className='flex justify-center'>
                <LoadingSkeleton height='h-6' width='w-48' rounded='md' />
              </div>
              <div className='space-y-3'>
                <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
                <LoadingSkeleton height='h-4' width='w-3/4' rounded='sm' />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
