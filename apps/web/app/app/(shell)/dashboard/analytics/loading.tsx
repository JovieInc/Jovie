import { LoadingSkeleton } from '@/components/molecules/LoadingSkeleton';

const STAT_CARD_KEYS = [
  'stat-views',
  'stat-visitors',
  'stat-subscribers',
] as const;
const LIST_SECTION_KEYS = [
  'list-cities',
  'list-sources',
  'list-links',
] as const;
const LIST_ITEM_KEYS = Array.from(
  { length: 5 },
  (_, i) => `list-item-${i + 1}`
);

/**
 * Analytics dashboard loading skeleton
 * Matches the DashboardAnalytics layout: header, stat cards, list sections
 */
export default function AnalyticsLoading() {
  return (
    <div
      className='max-w-5xl space-y-6 lg:space-y-8'
      aria-busy='true'
      aria-live='polite'
    >
      {/* Header: range label + range toggle */}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <LoadingSkeleton height='h-4' width='w-24' rounded='md' />
        <div className='flex items-center gap-2'>
          <LoadingSkeleton height='h-8' width='w-8' rounded='full' />
          <LoadingSkeleton height='h-8' width='w-48' rounded='full' />
        </div>
      </div>

      {/* Primary stat cards: 1 col mobile, 3 cols sm+ */}
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        {STAT_CARD_KEYS.map(key => (
          <div
            key={key}
            className='space-y-2 rounded-xl border border-subtle bg-surface-1 p-4 lg:p-5'
          >
            <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
            <LoadingSkeleton height='h-7' width='w-24' rounded='md' />
            <LoadingSkeleton height='h-3' width='w-16' rounded='sm' />
          </div>
        ))}
      </div>

      {/* List sections: 1 col mobile, 3 cols md+ */}
      <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
        {LIST_SECTION_KEYS.map(key => (
          <div
            key={key}
            className='rounded-xl border border-subtle bg-surface-1 p-4 lg:p-5'
          >
            {/* Section header */}
            <div className='mb-4 flex items-center gap-2'>
              <LoadingSkeleton height='h-4' width='w-4' rounded='md' />
              <LoadingSkeleton height='h-4' width='w-20' rounded='md' />
            </div>
            {/* List items */}
            <div className='space-y-2.5'>
              {LIST_ITEM_KEYS.map(itemKey => (
                <div
                  key={`${key}-${itemKey}`}
                  className='flex items-center justify-between'
                >
                  <div className='flex items-center gap-2'>
                    <LoadingSkeleton height='h-3' width='w-4' rounded='sm' />
                    <LoadingSkeleton height='h-3' width='w-20' rounded='sm' />
                  </div>
                  <LoadingSkeleton height='h-3' width='w-8' rounded='sm' />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
