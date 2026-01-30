import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const AUDIENCE_TABLE_HEADER_KEYS = Array.from(
  { length: 7 },
  (_, i) => `audience-header-${i + 1}`
);
const AUDIENCE_TABLE_ROW_KEYS = Array.from(
  { length: 10 },
  (_, i) => `audience-row-${i + 1}`
);
const AUDIENCE_TABLE_COL_KEYS = Array.from(
  { length: 7 },
  (_, i) => `audience-col-${i + 1}`
);

export default function Loading() {
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <div className='shrink-0 border-b border-subtle bg-surface-1/75 backdrop-blur-md'>
        <div className='flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-6'>
          <div className='space-y-2'>
            <LoadingSkeleton height='h-6' width='w-40' rounded='md' />
            <LoadingSkeleton height='h-4' width='w-80' rounded='md' />
          </div>
          <LoadingSkeleton height='h-6' width='w-20' rounded='full' />
        </div>
      </div>

      <div className='flex-1 min-h-0 overflow-hidden'>
        <div className='flex h-full min-h-0 flex-col bg-surface-1'>
          <div className='flex-1 min-h-0 overflow-auto'>
            <div className='px-4 py-4 sm:px-6'>
              <div className='overflow-hidden rounded-xl border border-subtle bg-surface-1 shadow-sm'>
                <div className='grid grid-cols-7 gap-4 border-b border-subtle px-4 py-3'>
                  {AUDIENCE_TABLE_HEADER_KEYS.map(key => (
                    <LoadingSkeleton
                      key={key}
                      height='h-4'
                      width='w-24'
                      rounded='md'
                    />
                  ))}
                </div>
                <ul>
                  {AUDIENCE_TABLE_ROW_KEYS.map(rowKey => (
                    <li
                      key={rowKey}
                      className='grid grid-cols-7 items-center gap-4 border-b border-subtle px-4 last:border-b-0'
                      style={{ height: '44px' }}
                      aria-hidden='true'
                    >
                      {AUDIENCE_TABLE_COL_KEYS.map(colKey => (
                        <LoadingSkeleton
                          key={`${rowKey}-${colKey}`}
                          height='h-4'
                          width='w-full'
                          rounded='md'
                        />
                      ))}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className='sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-subtle bg-surface-1/75 px-4 py-2 text-xs text-secondary-token backdrop-blur-md sm:px-6'>
            <LoadingSkeleton height='h-4' width='w-48' rounded='md' />
            <div className='flex items-center gap-3'>
              <LoadingSkeleton height='h-8' width='w-28' rounded='md' />
              <div className='flex gap-2'>
                <LoadingSkeleton height='h-8' width='w-20' rounded='md' />
                <LoadingSkeleton height='h-8' width='w-16' rounded='md' />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
