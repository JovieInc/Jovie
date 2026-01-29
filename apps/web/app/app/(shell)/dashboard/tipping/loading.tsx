import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Tipping dashboard loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function TippingLoading() {
  return <AuthLoader />;
}
