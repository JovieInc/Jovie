import { AuthLoader } from '@/components/organisms/AuthLoader';

/**
 * Account page loading screen
 * Uses AuthLoader to match the unified layout (sidebar offset, no layout shift)
 */
export default function AccountLoading() {
  return <AuthLoader />;
}
