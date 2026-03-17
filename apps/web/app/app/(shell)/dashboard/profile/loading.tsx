import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const PROFILE_LOADING_LINK_KEYS = Array.from(
  { length: 4 },
  (_, i) => `profile-link-${i + 1}`
);

export default function ProfileLoading() {
  return (
    <div className='flex h-full min-h-0 flex-col'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-48'
        descriptionWidth='w-64'
        className='bg-(--linear-app-content-surface)'
      />

      {/* Content area */}
      <div className='flex-1 min-h-0 overflow-auto'>
        <div className='px-4 py-6 sm:px-6'>
          <div className='rounded-xl border border-subtle bg-(--linear-app-content-surface) p-6 shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)]'>
            {/* Profile avatar and name section */}
            <div className='flex items-center gap-4'>
              <LoadingSkeleton
                height='h-20'
                width='w-20'
                rounded='full'
                className='shrink-0'
              />
              <div className='flex-1 space-y-2'>
                <LoadingSkeleton height='h-5' width='w-40' rounded='md' />
                <LoadingSkeleton height='h-4' width='w-32' rounded='md' />
              </div>
            </div>

            {/* Links section */}
            <div className='mt-8 space-y-4'>
              <LoadingSkeleton height='h-5' width='w-24' rounded='md' />
              <div className='space-y-3'>
                {PROFILE_LOADING_LINK_KEYS.map(key => (
                  <div
                    key={key}
                    className='flex items-center gap-3 rounded-lg border border-subtle bg-(--linear-app-surface-elevated) p-3'
                  >
                    <LoadingSkeleton
                      height='h-10'
                      width='w-10'
                      rounded='lg'
                      className='shrink-0'
                    />
                    <div className='flex-1 space-y-1'>
                      <LoadingSkeleton
                        height='h-4'
                        width='w-1/2'
                        rounded='md'
                      />
                      <LoadingSkeleton
                        height='h-3'
                        width='w-1/3'
                        rounded='md'
                      />
                    </div>
                    <LoadingSkeleton height='h-8' width='w-8' rounded='lg' />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
