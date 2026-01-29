import { CardSkeleton } from '@/components/molecules/LoadingSkeleton';

const CAMPAIGN_SKELETON_KEYS = ['campaign-1', 'campaign-2', 'campaign-3'];

/**
 * Loading skeleton for the admin campaigns page.
 */
export default function CampaignsLoading() {
  return (
    <div className='p-6 space-y-6'>
      {/* Header skeleton */}
      <div className='flex items-center justify-between'>
        <div className='space-y-2'>
          <div className='h-8 w-40 skeleton rounded-md' />
          <div className='h-4 w-48 skeleton rounded-md' />
        </div>
        <div className='h-10 w-36 skeleton rounded-md' />
      </div>

      {/* Campaign cards grid */}
      <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
        {CAMPAIGN_SKELETON_KEYS.map(key => (
          <CardSkeleton key={key} />
        ))}
      </div>
    </div>
  );
}
