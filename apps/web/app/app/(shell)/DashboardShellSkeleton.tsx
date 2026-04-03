import type { ReactNode } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const navLabelWidths = ['w-16', 'w-20', 'w-14', 'w-14', 'w-14'] as const;
const LOADING_COPY_FONT_STYLE = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

function DefaultContentSkeleton() {
  return (
    <div className='flex flex-1 min-h-0 min-w-0 items-center justify-center overflow-hidden'>
      <div className='w-full max-w-2xl px-4'>
        <div className='rounded-[20px] border border-(--linear-app-frame-seam) bg-(--linear-app-content-surface) px-5 py-6 shadow-none'>
          <p
            className='text-[12px] font-medium text-secondary-token'
            style={LOADING_COPY_FONT_STYLE}
          >
            Workspace
          </p>
          <h2
            className='mt-2 text-[28px] font-[590] leading-[1.05] tracking-[-0.035em] text-primary-token'
            style={LOADING_COPY_FONT_STYLE}
          >
            Loading your workspace
          </h2>
          <p
            className='mt-3 max-w-[34rem] text-[14px] leading-[21px] text-secondary-token'
            style={LOADING_COPY_FONT_STYLE}
          >
            Preparing your dashboard, smart links, messages, and latest
            activity.
          </p>
          <div className='mt-6 space-y-3'>
            <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
            <LoadingSkeleton height='h-4' width='w-3/4' rounded='sm' />
            <LoadingSkeleton height='h-4' width='w-2/3' rounded='sm' />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Streaming fallback for the dashboard shell.
 *
 * Renders immediately while DashboardShellContent resolves data.
 * Mimics the AppShellFrame layout (sidebar + header + content area)
 * so the user sees a recognizable shell shape at first byte.
 *
 * Accepts optional `children` to render route-specific content skeletons
 * inside the shell frame. Without children, renders a generic placeholder.
 */
export function DashboardShellSkeleton({
  children,
}: {
  readonly children?: ReactNode;
} = {}) {
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
                width={navLabelWidths[i - 1]}
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
            <p
              className='truncate text-[13px] font-[560] tracking-[-0.014em] text-primary-token'
              style={LOADING_COPY_FONT_STYLE}
            >
              Loading your workspace
            </p>
            <div className='flex-1' />
            <LoadingSkeleton height='h-7' width='w-20' rounded='md' />
          </div>

          {/* Content area — route-specific or generic */}
          {children ?? <DefaultContentSkeleton />}
        </div>
      </main>
    </div>
  );
}
