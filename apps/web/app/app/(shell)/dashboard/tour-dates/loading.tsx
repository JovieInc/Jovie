import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const ROW_KEYS = Array.from({ length: 6 }, (_, i) => `tour-row-${i + 1}`);

/**
 * Tour dates loading skeleton
 * Mobile: stacked cards with date, venue, location
 * Desktop: table rows matching TourDatesTable columns
 */
export default function TourDatesLoading() {
  return (
    <div className='flex h-full min-h-0 flex-col' aria-busy='true'>
      {/* Connection header placeholder */}
      <div className='shrink-0 flex items-center justify-between border-b border-subtle bg-surface-1 px-4 py-2'>
        <div className='flex items-center gap-2'>
          <LoadingSkeleton height='h-5' width='w-5' rounded='full' />
          <LoadingSkeleton height='h-4' width='w-40' rounded='md' />
        </div>
        <div className='flex items-center gap-2'>
          <LoadingSkeleton height='h-8' width='w-16' rounded='md' />
          <LoadingSkeleton height='h-8' width='w-24' rounded='md' />
        </div>
      </div>

      {/* Mobile: card layout (visible below sm) */}
      <div className='flex-1 min-h-0 overflow-auto sm:hidden'>
        <div className='divide-y divide-subtle'>
          {ROW_KEYS.map(key => (
            <div key={key} className='flex items-start gap-3 px-4 py-3'>
              {/* Date block */}
              <div className='shrink-0 flex flex-col items-center rounded-lg bg-surface-1 p-2'>
                <LoadingSkeleton height='h-3' width='w-8' rounded='sm' />
                <LoadingSkeleton
                  height='h-5'
                  width='w-6'
                  rounded='sm'
                  className='mt-0.5'
                />
              </div>
              {/* Details */}
              <div className='flex-1 min-w-0 space-y-1.5'>
                <LoadingSkeleton height='h-4' width='w-3/4' rounded='md' />
                <LoadingSkeleton height='h-3' width='w-1/2' rounded='sm' />
                <div className='flex items-center gap-2 pt-0.5'>
                  <LoadingSkeleton height='h-5' width='w-14' rounded='full' />
                  <LoadingSkeleton height='h-5' width='w-16' rounded='full' />
                </div>
              </div>
              {/* Action */}
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
        <table className='w-full border-collapse text-[13px]'>
          <thead className='sticky top-0 z-10 bg-surface-1'>
            <tr className='border-b border-subtle'>
              <th className='w-[120px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-10' rounded='md' />
              </th>
              <th className='min-w-[200px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-12' rounded='md' />
              </th>
              <th className='w-[180px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-16' rounded='md' />
              </th>
              <th className='w-[100px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-12' rounded='md' />
              </th>
              <th className='w-[80px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-14' rounded='md' />
              </th>
              <th className='w-[100px] px-4 py-3 text-left'>
                <LoadingSkeleton height='h-4' width='w-12' rounded='md' />
              </th>
              <th className='w-[80px] px-4 py-3' />
            </tr>
          </thead>
          <tbody>
            {ROW_KEYS.map(key => (
              <tr
                key={key}
                className='border-b border-subtle'
                style={{ height: 52 }}
              >
                <td className='px-4 py-3'>
                  <div className='space-y-1'>
                    <LoadingSkeleton height='h-4' width='w-16' rounded='sm' />
                    <LoadingSkeleton height='h-3' width='w-10' rounded='sm' />
                  </div>
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-24' rounded='md' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-5' width='w-14' rounded='full' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-12' rounded='md' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-4' width='w-16' rounded='md' />
                </td>
                <td className='px-4 py-3'>
                  <LoadingSkeleton height='h-6' width='w-6' rounded='md' />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
