import { Suspense } from 'react';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const RELEASES_LOADING_ROW_KEYS = Array.from(
  { length: 10 },
  (_, i) => `releases-row-${i + 1}`
);

/**
 * Release table skeleton component for loading states.
 * Matches the structure of ReleaseTable for a seamless loading experience.
 * Exported for use in Suspense boundaries throughout the app.
 */
export function ReleaseTableSkeleton() {
  return (
    <div
      className='flex h-full min-h-0 flex-col'
      data-testid='releases-loading'
    >
      {/* Table container */}
      <div className='flex-1 min-h-0 overflow-auto'>
        <table className='w-full border-collapse'>
          {/* Table header */}
          <thead className='sticky top-0 z-10 bg-surface-1'>
            <tr className='border-b border-subtle'>
              {/* Checkbox column */}
              <th className='w-14 px-4 py-3'>
                <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
              </th>
              {/* Release column */}
              <th className='min-w-[200px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-16' />
              </th>
              {/* Type column */}
              <th className='w-20 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-10' />
              </th>
              {/* Availability column */}
              <th className='w-32 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-20' />
              </th>
              {/* Smart Link column */}
              <th className='w-28 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-20' />
              </th>
              {/* Date column */}
              <th className='w-24 px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-16' />
              </th>
              {/* Actions column */}
              <th className='w-12 px-4 py-3' />
            </tr>
          </thead>
          {/* Table body with skeleton rows */}
          <tbody>
            {RELEASES_LOADING_ROW_KEYS.map(rowKey => (
              <tr key={rowKey} className='border-b border-subtle'>
                {/* Checkbox */}
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-4' rounded='sm' />
                </td>
                {/* Release info with artwork */}
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
                {/* Type badge */}
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-5' width='w-14' rounded='full' />
                </td>
                {/* Availability icons */}
                <td className='px-4 py-3'>
                  <div className='flex gap-1'>
                    <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                    <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                    <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                  </div>
                </td>
                {/* Smart link */}
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-20' />
                </td>
                {/* Date */}
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-16' />
                </td>
                {/* Actions */}
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className='flex items-center justify-between border-t border-subtle bg-base px-4 py-3'>
        <LoadingSkeleton height='h-4' width='w-24' />
        <div className='flex items-center gap-3'>
          <LoadingSkeleton height='h-4' width='w-32' />
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
