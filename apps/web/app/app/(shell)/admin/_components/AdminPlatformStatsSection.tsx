import { PlatformStatsStrip } from '@/components/admin/PlatformStatsStrip';
import { ContentMetricCardSkeleton } from '@/components/molecules/ContentMetricCardSkeleton';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { getAdminPlatformStats } from '@/lib/admin/platform-stats';

const PLATFORM_STAT_SKELETON_KEYS = [
  'labels',
  'visitors',
  'clicks',
  'captures',
  'creators',
  'releases',
  'tracks',
] as const;

const PLATFORM_BADGE_SKELETON_KEYS = [
  'badge-1',
  'badge-2',
  'badge-3',
  'badge-4',
];

export async function AdminPlatformStatsSection() {
  const stats = await getAdminPlatformStats();

  return (
    <section id='platform-stats' data-testid='admin-platform-stats-section'>
      <PlatformStatsStrip stats={stats} />
    </section>
  );
}

export function AdminPlatformStatsSectionSkeleton() {
  return (
    <section id='platform-stats'>
      <div className='space-y-4' aria-hidden='true'>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7'>
          {PLATFORM_STAT_SKELETON_KEYS.map(key => (
            <ContentMetricCardSkeleton
              key={key}
              className='p-3.5'
              showIcon={false}
            />
          ))}
        </div>
        <ContentSurfaceCard className='space-y-3 p-4'>
          <div className='h-4 w-72 rounded skeleton' />
          <div className='flex flex-wrap gap-2'>
            {PLATFORM_BADGE_SKELETON_KEYS.map(key => (
              <div key={key} className='h-6 w-20 rounded skeleton' />
            ))}
          </div>
        </ContentSurfaceCard>
      </div>
    </section>
  );
}
