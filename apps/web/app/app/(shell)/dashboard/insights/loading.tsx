import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const INSIGHT_CARD_KEYS = Array.from({ length: 4 }, (_, i) => `insight-${i}`);
const FILTER_CHIP_KEYS = Array.from({ length: 5 }, (_, i) => `filter-${i}`);

/**
 * Insights loading skeleton (JOV-1087)
 * Matches the InsightsSkeleton inline fallback for consistent loading states.
 */
export default function InsightsLoading() {
  return (
    <div className='max-w-3xl space-y-6' aria-busy='true'>
      <div className='flex items-center justify-between'>
        <div className='space-y-1.5'>
          <LoadingSkeleton height='h-5' width='w-28' rounded='md' />
          <LoadingSkeleton height='h-3' width='w-48' rounded='md' />
        </div>
        <LoadingSkeleton height='h-8' width='w-28' rounded='lg' />
      </div>
      <div className='flex gap-1.5'>
        {FILTER_CHIP_KEYS.map(key => (
          <div key={key} className='h-7 w-20 skeleton rounded-full' />
        ))}
      </div>
      <div className='space-y-3'>
        {INSIGHT_CARD_KEYS.map(key => (
          <div
            key={key}
            className='h-28 rounded-xl border border-subtle skeleton'
          />
        ))}
      </div>
    </div>
  );
}
