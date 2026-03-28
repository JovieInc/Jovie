import { headers } from 'next/headers';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { APP_ROUTES } from '@/constants/routes';
import ChatLoading from './chat/loading';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';

function resolveRequestPath(nextUrlHeader: string | null): string | null {
  if (!nextUrlHeader) {
    return null;
  }

  try {
    return new URL(nextUrlHeader, 'https://jovie.local').pathname;
  } catch {
    return null;
  }
}

function isChatRoute(pathname: string | null) {
  if (!pathname) {
    return false;
  }

  return (
    pathname === APP_ROUTES.DASHBOARD ||
    pathname === APP_ROUTES.CHAT ||
    pathname.startsWith(`${APP_ROUTES.CHAT}/`)
  );
}

function isReleasesRoute(pathname: string | null) {
  return (
    pathname === APP_ROUTES.RELEASES ||
    pathname === APP_ROUTES.DASHBOARD_RELEASES
  );
}

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
  const pathname = resolveRequestPath(headerStore.get('next-url'));

  if (isChatRoute(pathname)) {
    return <ChatLoading />;
  }

  if (isReleasesRoute(pathname)) {
    return <ReleaseTableSkeleton />;
  }

  return (
    <div
      className='space-y-5 rounded-2xl border border-subtle bg-surface-0 p-4 sm:p-5'
      aria-busy='true'
      aria-live='polite'
    >
      <div className='flex items-center justify-between gap-3'>
        <LoadingSkeleton height='h-6' width='w-44' rounded='md' />
        <LoadingSkeleton height='h-8' width='w-24' rounded='md' />
      </div>

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
