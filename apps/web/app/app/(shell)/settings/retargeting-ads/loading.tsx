import { ContentSectionHeaderSkeleton } from '@/components/molecules/ContentSectionHeaderSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { PageContent, PageShell } from '@/components/organisms/PageShell';

function SummaryCardSkeleton() {
  return (
    <ContentSurfaceCard surface='nested' className='space-y-1 p-4'>
      <LoadingSkeleton height='h-7' width='w-8' rounded='md' />
      <LoadingSkeleton height='h-3' width='w-20' rounded='md' />
      <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
    </ContentSurfaceCard>
  );
}

function AdPreviewCardSkeleton() {
  return (
    <ContentSurfaceCard surface='nested' className='space-y-3 p-4'>
      <div className='aspect-square rounded-[10px] skeleton motion-reduce:animate-none' />
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <LoadingSkeleton height='h-4' width='w-20' rounded='md' />
          <LoadingSkeleton height='h-3' width='w-16' rounded='md' />
        </div>
        <LoadingSkeleton height='h-8' width='w-24' rounded='md' />
      </div>
    </ContentSurfaceCard>
  );
}

function AdGroupSkeleton() {
  return (
    <ContentSurfaceCard surface='details'>
      <ContentSectionHeaderSkeleton
        titleWidth='w-36'
        descriptionWidth='w-80'
        className='min-h-0 px-4 py-3'
      />
      <div className='grid grid-cols-1 gap-4 p-3 pt-0 sm:grid-cols-2 sm:p-4 sm:pt-0'>
        <AdPreviewCardSkeleton />
        <AdPreviewCardSkeleton />
      </div>
    </ContentSurfaceCard>
  );
}

/**
 * Retargeting ads page loading skeleton.
 * Matches: summary cards → attribution → 2 ad groups → instructions.
 */
export default function RetargetingAdsLoading() {
  return (
    <PageShell>
      <PageContent>
        <div className='space-y-6'>
          {/* Summary section */}
          <ContentSurfaceCard surface='details'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-36'
              descriptionWidth='w-96'
              className='min-h-0 px-4 py-3'
            />
            <div className='grid grid-cols-1 gap-3 p-3 pt-0 sm:grid-cols-3 sm:p-4 sm:pt-0'>
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
              <SummaryCardSkeleton />
            </div>
          </ContentSurfaceCard>

          {/* Fan retargeting ad group */}
          <AdGroupSkeleton />

          {/* Profile claim ad group */}
          <AdGroupSkeleton />

          {/* Instructions section */}
          <ContentSurfaceCard surface='details'>
            <ContentSectionHeaderSkeleton
              titleWidth='w-48'
              descriptionWidth='w-96'
              className='min-h-0 px-4 py-3'
            />
            <div className='space-y-2 px-8 py-5 pt-4'>
              <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
              <LoadingSkeleton height='h-4' width='w-11/12' rounded='md' />
              <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
              <LoadingSkeleton height='h-4' width='w-10/12' rounded='md' />
              <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
              <LoadingSkeleton height='h-4' width='w-9/12' rounded='md' />
            </div>
          </ContentSurfaceCard>
        </div>
      </PageContent>
    </PageShell>
  );
}
