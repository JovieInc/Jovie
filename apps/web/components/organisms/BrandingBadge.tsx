'use client';

import { useUserSafe } from '@/hooks/useClerkSafe';

/**
 * Branding badge that shows "Made with Jovie" for free plan users
 * Hidden for Pro plan users
 */
export function BrandingBadge() {
  const { user, isLoaded } = useUserSafe();

  // Show a placeholder while loading to avoid layout shift
  if (!isLoaded) {
    return (
      <div className='h-3 w-24 rounded-sm skeleton motion-reduce:animate-none' />
    );
  }

  // Check if user has Pro plan
  // Since Clerk billing integration varies, we'll check for the plan in publicMetadata
  const userPlan = user?.publicMetadata?.plan || 'free';

  // Hide branding for paid users
  if (userPlan === 'standard' || userPlan === 'pro') {
    return null;
  }

  return <div className='text-xs opacity-60'>Made with Jovie</div>;
}
