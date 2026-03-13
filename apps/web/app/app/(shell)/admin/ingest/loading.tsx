import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

const SKELETON_ROW_KEYS = Array.from(
  { length: 6 },
  (_, i) => `ingest-row-${i + 1}`
);

export default function AdminIngestLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6' aria-busy='true'>
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-44'
              descriptionWidth='w-64'
              className='border-b-0 px-6'
            />
          </ContentSurfaceCard>
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-36'
              className='border-b-0 px-6'
            />
            <div className='px-6 py-5'>
              <div className='h-24 rounded-[10px] skeleton' />
              <div className='mt-3 flex items-center justify-between gap-3'>
                <div className='h-3 w-24 rounded skeleton' />
                <div className='h-8 w-32 rounded skeleton' />
              </div>
            </div>
          </ContentSurfaceCard>
          <ContentSurfaceCard className='overflow-hidden'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-40'
              descriptionWidth='w-56'
              className='border-b-0 px-6'
            />
            <div className='px-6 py-5'>
              <div className='space-y-3'>
                {SKELETON_ROW_KEYS.map(key => (
                  <div key={key} className='flex items-center gap-3'>
                    <div className='size-4 rounded skeleton' />
                    <div className='h-4 w-20 rounded skeleton' />
                    <div className='h-4 w-32 rounded skeleton' />
                    <div className='ml-auto h-3 w-12 rounded skeleton' />
                  </div>
                ))}
              </div>
            </div>
          </ContentSurfaceCard>
        </div>
      </PageContent>
    </PageShell>
  );
}
