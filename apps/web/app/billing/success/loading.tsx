import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Billing success page loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function BillingSuccessLoading() {
  return <AuthLoader />;
}
