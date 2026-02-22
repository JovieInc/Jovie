import { TouringSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Touring settings loading screen — uses the inline touring skeleton
 * that matches the disconnected/form state shape.
 */
export default function SettingsTouringLoading() {
  return (
    <div className='mx-auto max-w-2xl'>
      <div className='space-y-8 pb-8'>
        <section className='scroll-mt-4'>
          <div className='mb-6 space-y-2'>
            <div className='h-8 w-48 rounded skeleton' />
            <div className='h-4 w-80 rounded skeleton' />
          </div>
          <div className='rounded-2xl bg-surface-1/40 p-6 shadow-none'>
            <TouringSectionSkeleton />
          </div>
        </section>
      </div>
    </div>
  );
}
