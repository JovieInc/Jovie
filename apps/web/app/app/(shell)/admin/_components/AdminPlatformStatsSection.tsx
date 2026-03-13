import { PlatformStatsStrip } from '@/components/admin/PlatformStatsStrip';
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
      <ContentSurfaceCard className='space-y-6 p-5' aria-hidden='true'>
        <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7'>
          {PLATFORM_STAT_SKELETON_KEYS.map(key => (
            <div key={key} className='space-y-1'>
              <div className='h-8 w-14 rounded skeleton' />
              <div className='h-4 w-24 rounded skeleton' />
            </div>
          ))}
        </div>
        <div className='space-y-3 border-t border-(--linear-border-subtle) pt-4'>
          <div className='h-4 w-72 rounded skeleton' />
          <div className='flex flex-wrap gap-2'>
            {PLATFORM_BADGE_SKELETON_KEYS.map(key => (
              <div key={key} className='h-6 w-20 rounded skeleton' />
            ))}
          </div>
        </div>
      </ContentSurfaceCard>
    </section>
  );
}
