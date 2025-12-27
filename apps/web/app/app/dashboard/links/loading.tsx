import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

export default function LinksLoading() {
  const pillKeys = [
    'pill-1',
    'pill-2',
    'pill-3',
    'pill-4',
    'pill-5',
    'pill-6',
  ] as const;
  const rowKeys = ['row-1', 'row-2', 'row-3', 'row-4'] as const;

  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        <div className='space-y-2'>
          <LoadingSkeleton height='h-7' width='w-40' />
          <LoadingSkeleton height='h-4' width='w-72' />
        </div>

        <div className='mt-6 flex flex-wrap gap-2'>
          {pillKeys.map(key => (
            <LoadingSkeleton
              key={key}
              height='h-8'
              width='w-24'
              rounded='full'
              className='shrink-0'
            />
          ))}
        </div>

        <div className='mt-6 space-y-3'>
          {rowKeys.map(key => (
            <div
              key={key}
              className='flex items-start gap-3 rounded-lg border border-subtle bg-surface-0 p-3'
            >
              <LoadingSkeleton
                height='h-10'
                width='w-10'
                rounded='full'
                className='shrink-0'
              />
              <div className='flex-1 space-y-2'>
                <LoadingSkeleton height='h-4' width='w-2/3' />
                <LoadingSkeleton height='h-3' width='w-1/2' />
              </div>
              <div className='flex gap-2'>
                <LoadingSkeleton height='h-9' width='w-14' />
                <LoadingSkeleton height='h-9' width='w-14' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
