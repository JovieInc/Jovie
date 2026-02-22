import { ContactsSectionSkeleton } from '@/components/molecules/SettingsLoadingSkeleton';

/**
 * Contacts settings loading screen — uses the inline contacts skeleton
 * that matches the contact list shape.
 */
export default function SettingsContactsLoading() {
  return (
    <div className='mx-auto max-w-2xl'>
      <div className='space-y-8 pb-8'>
        <section className='scroll-mt-4'>
          <div className='mb-6 space-y-2'>
            <div className='h-8 w-48 rounded skeleton' />
            <div className='h-4 w-80 rounded skeleton' />
          </div>
          <div className='rounded-2xl bg-surface-1/40 p-6 shadow-none'>
            <ContactsSectionSkeleton />
          </div>
        </section>
      </div>
    </div>
  );
}
