import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Tour dates dashboard loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function TourDatesLoading() {
  return <AuthLoader />;
}
