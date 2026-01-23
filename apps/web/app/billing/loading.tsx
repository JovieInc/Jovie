import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Billing page loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function BillingLoading() {
  return <AuthLoader />;
}
