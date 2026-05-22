import { SettingsSection } from '@/components/features/dashboard/organisms/SettingsSection';
import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';
import { SettingsPanel } from '@/components/molecules/settings/SettingsPanel';

function SummaryCardSkeleton() {
  return (
    <div className='min-h-[116px] rounded-md border border-subtle bg-surface-0 px-3 py-3'>
      <LoadingSkeleton height='h-7' width='w-8' rounded='md' />
      <LoadingSkeleton height='h-3' width='w-20' rounded='md' />
      <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
    </div>
  );
}

function AdPreviewCardSkeleton() {
  return (
    <div className='space-y-3 rounded-md border border-subtle bg-surface-0 p-4'>
      <div className='aspect-square rounded-lg skeleton motion-reduce:animate-none' />
      <div className='flex items-start justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <LoadingSkeleton height='h-4' width='w-20' rounded='md' />
          <LoadingSkeleton height='h-3' width='w-16' rounded='md' />
        </div>
        <LoadingSkeleton height='h-8' width='w-24' rounded='md' />
      </div>
    </div>
  );
}

function AdGroupSkeleton() {
  return (
    <SettingsPanel
      title={<LoadingSkeleton height='h-4' width='w-36' rounded='md' />}
      description={<LoadingSkeleton height='h-3' width='w-80' rounded='md' />}
      cardClassName='p-4'
    >
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
        <AdPreviewCardSkeleton />
        <AdPreviewCardSkeleton />
      </div>
    </SettingsPanel>
  );
}

/**
 * Retargeting ads page loading skeleton.
 * Matches: summary cards → attribution → 2 ad groups → instructions.
 */
export default function RetargetingAdsLoading() {
  return (
    <SettingsSection
      id='retargeting-ads'
      title='Retargeting ads'
      description='Download ready-to-run creatives for Meta retargeting campaigns.'
    >
      {/* Summary section */}
      <SettingsPanel
        title={<LoadingSkeleton height='h-4' width='w-28' rounded='md' />}
        description={<LoadingSkeleton height='h-3' width='w-72' rounded='md' />}
        cardClassName='p-4'
      >
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
          <SummaryCardSkeleton />
        </div>
      </SettingsPanel>

      <SettingsPanel
        className='min-h-[156px]'
        title={<LoadingSkeleton height='h-4' width='w-40' rounded='md' />}
        description={<LoadingSkeleton height='h-3' width='w-72' rounded='md' />}
        cardClassName='p-4'
      >
        <div className='space-y-3'>
          <LoadingSkeleton height='h-7' width='w-10' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-72' rounded='md' />
          <div className='flex gap-2'>
            <LoadingSkeleton height='h-12' width='w-20' rounded='md' />
            <LoadingSkeleton height='h-12' width='w-20' rounded='md' />
          </div>
        </div>
      </SettingsPanel>

      {/* Fan retargeting ad group */}
      <AdGroupSkeleton />

      {/* Profile claim ad group */}
      <AdGroupSkeleton />

      {/* Instructions section */}
      <SettingsPanel
        title={<LoadingSkeleton height='h-4' width='w-48' rounded='md' />}
        description={<LoadingSkeleton height='h-3' width='w-80' rounded='md' />}
        cardClassName='p-5'
      >
        <div className='space-y-2'>
          <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-11/12' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-10/12' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-full' rounded='md' />
          <LoadingSkeleton height='h-4' width='w-9/12' rounded='md' />
        </div>
      </SettingsPanel>
    </SettingsSection>
  );
}
