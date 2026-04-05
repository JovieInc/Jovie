import { headers } from 'next/headers';
import ChatLoading from './chat/loading';
import { ReleaseTableSkeleton } from './dashboard/releases/loading';
import {
  isChatShellRoute,
  isReleasesShellRoute,
  resolveAppShellRequestPath,
} from './shell-route-matches';

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
    return <ReleaseTableSkeleton showHeader={false} />;
  }

  return (
    <div className='space-y-3 p-4 sm:p-5' aria-busy='true' aria-live='polite'>
      <div className='flex items-center justify-between gap-3'>
        <div className='space-y-2'>
          <div className='skeleton h-6 w-52 rounded-md' />
          <div className='skeleton h-4 w-72 rounded' />
        </div>
        <div className='skeleton h-8 w-24 rounded-md' />
      </div>

      <div className='space-y-3 rounded-xl border border-subtle/70 bg-surface-0 p-3'>
        <div className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] gap-3 border-b border-subtle/60 pb-2'>
          <div className='skeleton h-3 w-24 rounded' />
          <div className='skeleton h-3 w-16 rounded' />
          <div className='skeleton h-3 w-12 rounded' />
        </div>

        {[1, 2, 3, 4].map(row => (
          <div
            key={`shell-loading-row-${row}`}
            className='grid grid-cols-[minmax(0,1.5fr)_120px_72px] items-center gap-3 py-1'
          >
            <div className='skeleton h-4 w-full rounded' />
            <div className='skeleton h-4 w-20 rounded' />
            <div className='skeleton h-4 w-12 rounded' />
          </div>
        ))}
      </div>
    </div>
  );
}
