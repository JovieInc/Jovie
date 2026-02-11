import { Suspense } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const RELEASES_LOADING_ROW_KEYS = Array.from(
  { length: 10 },
  (_, i) => `releases-row-${i + 1}`
);

const RELEASES_MOBILE_ROW_KEYS = Array.from(
  { length: 6 },
  (_, i) => `releases-mobile-${i + 1}`
);

/**
 * Release table skeleton component for loading states.
 * Mobile: card layout with artwork, title, type badge
 * Desktop: full table matching ReleaseTable columns
 * Exported for use in Suspense boundaries throughout the app.
 */
export function ReleaseTableSkeleton() {
  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='releases-loading'
      aria-busy='true'
    >
      {/* Mobile: card layout (visible below sm) */}
      <div className='flex-1 min-h-0 overflow-auto sm:hidden'>
        <div className='divide-y divide-subtle'>
          {RELEASES_MOBILE_ROW_KEYS.map(key => (
            <div key={key} className='flex items-center gap-3 px-4 py-3'>
              {/* Artwork */}
              <LoadingSkeleton
                height='h-12'
                width='w-12'
                rounded='md'
                className='shrink-0'
              />
              {/* Release info */}
              <div className='flex-1 min-w-0 space-y-1.5'>
                <LoadingSkeleton height='h-4' width='w-3/4' rounded='md' />
                <LoadingSkeleton height='h-3' width='w-1/2' rounded='sm' />
                <div className='flex items-center gap-2 pt-0.5'>
                  <LoadingSkeleton height='h-5' width='w-14' rounded='full' />
                  <div className='flex gap-1'>
                    <LoadingSkeleton height='h-5' width='w-5' rounded='sm' />
                    <LoadingSkeleton height='h-5' width='w-5' rounded='sm' />
                    <LoadingSkeleton height='h-5' width='w-5' rounded='sm' />
                  </div>
                </div>
              </div>
              {/* Actions */}
              <LoadingSkeleton
                height='h-8'
                width='w-8'
                rounded='md'
                className='shrink-0'
              />
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: table layout (hidden below sm) */}
      <div className='hidden flex-1 min-h-0 overflow-auto sm:block'>
        <table className='w-full border-collapse'>
          <thead className='sticky top-0 z-10 bg-surface-1'>
            <tr className='border-b border-subtle'>
              <th className='w-14 px-4 py-3'>
                <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
              </th>
              <th className='min-w-[200px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-16' />
              </th>
              <th className='w-20 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-10' />
              </th>
              <th className='w-32 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-20' />
              </th>
              <th className='w-28 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-20' />
              </th>
              <th className='w-24 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-16' />
              </th>
              <th className='w-12 px-4 py-3' />
            </tr>
          </thead>
          <tbody>
            {RELEASES_LOADING_ROW_KEYS.map(rowKey => (
              <tr key={rowKey} className='border-b border-subtle'>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
                </td>
                <td className='px-4 py-3'>
                  <div className='flex items-center gap-3'>
                    <LoadingSkeleton
                      height='h-10'
                      width='w-10'
                      rounded='md'
                      className='shrink-0'
                    />
                    <div className='space-y-1.5'>
                      <LoadingSkeleton height='h-4' width='w-32' />
                      <LoadingSkeleton height='h-3' width='w-20' />
                    </div>
                  </div>
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-5' width='w-14' rounded='full' />
                </td>
                <td className='px-4 py-3'>
                  <div className='flex gap-1'>
                    <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                    <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                    <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                  </div>
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-20' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-16' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className='shrink-0 flex items-center justify-between border-t border-subtle bg-base px-4 py-3'>
        <LoadingSkeleton height='h-4' width='w-24' />
        <div className='flex items-center gap-3'>
          <LoadingSkeleton
            height='h-4'
            width='w-32'
            className='hidden sm:block'
          />
          <LoadingSkeleton height='h-8' width='w-20' rounded='md' />
          <LoadingSkeleton height='h-8' width='w-8' rounded='md' />
        </div>
      </div>
    </div>
  );
}

/**
 * Default export for Next.js file-based loading state.
 * Automatically used as Suspense fallback during route navigation.
 */
export default function ReleasesLoading() {
  return (
    <Suspense fallback={null}>
      <ReleaseTableSkeleton />
    </Suspense>
  );
}
