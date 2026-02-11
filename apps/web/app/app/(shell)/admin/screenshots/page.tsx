import { Skeleton } from '@jovie/ui';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import {
  PageContent,
  PageHeader,
  PageShell,
} from '@/components/organisms/PageShell';
import { getScreenshots } from '@/lib/admin/screenshots';

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `ss-skel-${i}`);

const ScreenshotGallery = dynamic(
  () =>
    import('@/components/admin/ScreenshotGallery').then(mod => ({
      default: mod.ScreenshotGallery,
    })),
  {
    loading: () => (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {SKELETON_KEYS.map(key => (
          <div key={key} className='space-y-2'>
            <Skeleton className='aspect-video w-full' rounded='lg' />
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-8 w-24' rounded='md' />
          </div>
        ))}
      </div>
    ),
  }
);

export const metadata: Metadata = {
  title: 'Screenshots | Admin',
};

export const runtime = 'nodejs';

export default async function AdminScreenshotsPage() {
  const screenshots = await getScreenshots();

  return (
    <PageShell>
      <PageHeader
        title='Screenshots'
        description={`${screenshots.length} screenshots from docs and e2e tests`}
      />
      <PageContent>
        <ScreenshotGallery screenshots={screenshots} />
      </PageContent>
    </PageShell>
  );
}
