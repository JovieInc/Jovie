import { AdminPage } from '@/components/features/admin/layout/AdminPage';
import { ScreenshotGallerySkeleton } from './ScreenshotGallerySkeleton';

/**
 * Screenshots loading screen — matches gallery grid layout.
 */
export default function ScreenshotsLoading() {
  return (
    <AdminPage
      title='Screenshots'
      testId='admin-screenshots-loading'
      viewTestId='admin-screenshots-loading-content'
    >
      <ScreenshotGallerySkeleton />
    </AdminPage>
  );
}
