import { Skeleton } from '@jovie/ui';
import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { AdminToolPage } from '@/components/features/admin/layout/AdminToolPage';
import { ContentSurfaceCard } from '@/components/molecules/ContentSurfaceCard';
import { APP_ROUTES } from '@/constants/routes';
import { getScreenshots } from '@/lib/admin/screenshots';
import { CANONICAL_SURFACES } from '@/lib/canonical-surfaces';
import { captureError } from '@/lib/error-tracking';

const SKELETON_KEYS = Array.from({ length: 8 }, (_, i) => `ss-skel-${i}`);

const ScreenshotGallery = dynamic(
  () =>
    import('@/features/admin/ScreenshotGallery').then(mod => ({
      default: mod.ScreenshotGallery,
    })),
  {
    loading: () => (
      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
        {SKELETON_KEYS.map(key => (
          <ContentSurfaceCard key={key} className='space-y-3 rounded-xl p-3.5'>
            <Skeleton className='aspect-video w-full' rounded='lg' />
            <Skeleton className='h-4 w-3/4' />
            <Skeleton className='h-8 w-24' rounded='md' />
          </ContentSurfaceCard>
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
  let screenshots: Awaited<ReturnType<typeof getScreenshots>> = [];
  let catalogError: string | undefined;
  try {
    screenshots = await getScreenshots();
  } catch (err) {
    catalogError =
      err instanceof Error ? err.message : 'Unknown error loading catalog';
    await captureError('Admin screenshots page failed to load catalog', err, {
      route: APP_ROUTES.ADMIN_SCREENSHOTS,
    });
  }

  const canonicalCaptureCount = screenshots.filter(
    screenshot => screenshot.canonicalSurfaceId !== undefined
  ).length;
  const supportingCaptureCount = screenshots.length - canonicalCaptureCount;

  const description = catalogError
    ? 'Screenshot catalog is unavailable in this environment. Check the deploy logs and ensure the catalog directory is bundled.'
    : `Review ${CANONICAL_SURFACES.length} canonical surfaces across ${canonicalCaptureCount} canonical captures, plus ${supportingCaptureCount} supporting captures from the latest screenshot catalog.`;

  return (
    <AdminToolPage
      title='Screenshots'
      description={description}
      testId='admin-screenshots-page'
    >
      <ScreenshotGallery screenshots={screenshots} />
    </AdminToolPage>
  );
}
