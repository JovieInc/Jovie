import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `ss-loading-${i}`);

/**
 * Screenshots loading screen — matches gallery grid layout.
 */
export default function ScreenshotsLoading() {
  return (
    <AdminPage title='Screenshots' testId='admin-screenshots-loading'>
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {SKELETON_KEYS.map(key => (
          <ContentSurfaceCard key={key} surface='nested'>
            <div className='space-y-3 p-3.5'>
              <div className='aspect-video w-full rounded-lg skeleton' />
              <div className='h-4 w-3/4 skeleton' />
              <div className='h-8 w-24 rounded-md skeleton' />
            </div>
          </ContentSurfaceCard>
        ))}
      </div>
    </AdminPage>
  );
}
