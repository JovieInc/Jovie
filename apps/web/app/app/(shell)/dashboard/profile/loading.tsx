import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const PROFILE_LOADING_LINK_KEYS = Array.from(
  { length: 4 },
  (_, i) => `profile-link-${i + 1}`
);

export default function ProfileLoading() {
  return (
    <div className='min-h-screen'>
      <div className='rounded-xl border border-subtle bg-surface-1 p-6 shadow-sm'>
        {/* Header */}
        <div className='space-y-2'>
          <LoadingSkeleton height='h-7' width='w-48' />
          <LoadingSkeleton height='h-4' width='w-64' />
        </div>

        {/* Profile avatar and name section */}
        <div className='mt-6 flex items-center gap-4'>
          <LoadingSkeleton
            height='h-20'
            width='w-20'
            rounded='full'
            className='shrink-0'
          />
          <div className='flex-1 space-y-2'>
            <LoadingSkeleton height='h-5' width='w-40' />
            <LoadingSkeleton height='h-4' width='w-32' />
          </div>
        </div>

        {/* Links section */}
        <div className='mt-8 space-y-4'>
          <LoadingSkeleton height='h-5' width='w-24' />
          <div className='space-y-3'>
            {PROFILE_LOADING_LINK_KEYS.map(key => (
              <div
                key={key}
                className='flex items-center gap-3 rounded-lg border border-subtle bg-surface-0 p-3'
              >
                <LoadingSkeleton
                  height='h-10'
                  width='w-10'
                  rounded='lg'
                  className='shrink-0'
                />
                <div className='flex-1 space-y-1'>
                  <LoadingSkeleton height='h-4' width='w-1/2' />
                  <LoadingSkeleton height='h-3' width='w-1/3' />
                </div>
                <LoadingSkeleton height='h-8' width='w-8' rounded='lg' />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
