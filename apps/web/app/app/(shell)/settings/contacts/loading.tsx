import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
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
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-24'
              descriptionWidth='w-80'
              actionWidths={['w-28']}
              className='min-h-0 px-4 py-3'
              actionsClassName='w-auto shrink-0'
            />
            <div className='px-4 py-3'>
              <ContactsSectionSkeleton />
            </div>
          </ContentSurfaceCard>
        </section>
      </div>
    </div>
  );
}
