import { headers } from 'next/headers';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import ChatLoading from './chat/loading';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';
import {
  isChatShellRoute,
  isReleasesShellRoute,
  resolveAppShellRequestPath,
} from './shell-route-matches';

const LOADING_COPY_FONT_STYLE = {
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
} as const;

/**
 * Shell-level loading state shown during cross-section navigation
 * (e.g., dashboard -> settings, chat -> admin).
 *
 * Renders a minimal content skeleton that avoids layout shift while the
 * destination page and its data resolve. The shell (sidebar, header) persists
 * because they live in the parent layout — only the content area is replaced.
 */
export default async function ShellLoading() {
  const headerStore = await headers();
  const pathname = resolveAppShellRequestPath(
    headerStore.get('next-url'),
    headerStore.get('x-matched-path'),
    headerStore.get('x-invoke-path')
  );

  if (isChatShellRoute(pathname)) {
    return <ChatLoading />;
  }

  if (isReleasesShellRoute(pathname)) {
    return <ReleaseTableSkeleton />;
  }

  return (
    <div
      className='space-y-5 rounded-2xl border border-subtle bg-surface-0 p-4 sm:p-5'
      aria-busy='true'
      aria-live='polite'
    >
      <div className='flex items-center justify-between gap-3'>
        <div>
          <p
            className='text-[12px] font-medium text-secondary-token'
            style={LOADING_COPY_FONT_STYLE}
          >
            Workspace
          </p>
          <h2
            className='mt-1 text-[24px] font-[590] leading-[1.05] tracking-[-0.03em] text-primary-token'
            style={LOADING_COPY_FONT_STYLE}
          >
            Loading your workspace
          </h2>
        </div>
        <LoadingSkeleton height='h-8' width='w-24' rounded='md' />
      </div>
      <p
        className='max-w-[34rem] text-[13px] leading-[20px] text-secondary-token'
        style={LOADING_COPY_FONT_STYLE}
      >
        Preparing your dashboard, smart links, messages, and latest activity.
      </p>

      <div className='space-y-3 rounded-xl border border-subtle/70 bg-surface-0 p-3'>
        <div className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] gap-3 border-b border-subtle/60 pb-2'>
          <LoadingSkeleton height='h-3' width='w-24' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
          <LoadingSkeleton height='h-3' width='w-12' rounded='sm' />
        </div>

        {[1, 2, 3, 4].map(row => (
          <div
            key={`shell-loading-row-${row}`}
            className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] items-center gap-3 py-1'
          >
            <LoadingSkeleton height='h-4' width='w-full' rounded='sm' />
            <LoadingSkeleton height='h-4' width='w-20' rounded='sm' />
            <LoadingSkeleton height='h-4' width='w-12' rounded='sm' />
          </div>
        ))}
      </div>
    </div>
  );
}
