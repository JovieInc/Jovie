import {
  PageContent,
  PageHeader,
  PageShell,
} from '@/components/organisms/PageShell';

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `ss-loading-${i}`);

/**
 * Screenshots loading screen — matches gallery grid layout.
 */
export default function ScreenshotsLoading() {
  return (
    <PageShell>
      <PageHeader title='Screenshots' description='Loading screenshots...' />
      <PageContent>
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
          {SKELETON_KEYS.map(key => (
            <div key={key} className='space-y-2'>
              <div className='aspect-video w-full rounded-lg skeleton' />
              <div className='h-4 w-3/4 skeleton' />
              <div className='h-8 w-24 rounded-md skeleton' />
            </div>
          ))}
        </div>
      </PageContent>
    </PageShell>
  );
}
