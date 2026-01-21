import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const CONTACTS_LOADING_ROW_KEYS = Array.from(
  { length: 6 },
  (_, i) => `contacts-row-${i + 1}`
);

export default function ContactsLoading() {
  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        {/* Header */}
        <div className='flex items-center justify-between'>
          <div className='space-y-2'>
            <LoadingSkeleton height='h-7' width='w-32' />
            <LoadingSkeleton height='h-4' width='w-48' />
          </div>
          <LoadingSkeleton height='h-10' width='w-32' rounded='lg' />
        </div>

        {/* Search/filter bar */}
        <div className='mt-6 flex gap-3'>
          <LoadingSkeleton height='h-10' width='w-64' rounded='lg' />
          <LoadingSkeleton height='h-10' width='w-32' rounded='lg' />
        </div>

        {/* Contact list */}
        <div className='mt-6 space-y-3'>
          {CONTACTS_LOADING_ROW_KEYS.map(key => (
            <div
              key={key}
              className='flex items-center gap-4 rounded-lg border border-subtle bg-surface-0 p-4'
            >
              <LoadingSkeleton
                height='h-12'
                width='w-12'
                rounded='full'
                className='shrink-0'
              />
              <div className='min-w-0 flex-1 space-y-1'>
                <LoadingSkeleton height='h-4' width='w-40' />
                <LoadingSkeleton height='h-3' width='w-48' />
              </div>
              <div className='flex gap-2'>
                <LoadingSkeleton height='h-8' width='w-8' rounded='lg' />
                <LoadingSkeleton height='h-8' width='w-8' rounded='lg' />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
