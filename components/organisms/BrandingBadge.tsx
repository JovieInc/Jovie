'use client';

import { useUser } from '@clerk/nextjs';

/**
 * Branding badge that shows "Made with Jovie" for free plan users
 * Hidden for Pro plan users
 */
export default function BrandingBadge() {
  const { user, isLoaded } = useUser();

  // Show a placeholder while loading to avoid layout shift
  if (!isLoaded) {
    return (
      <div className='h-3 w-24 rounded-sm skeleton motion-reduce:animate-none' />
    );
  }

  // Check if user has Pro plan
  // Since Clerk billing integration varies, we'll check for the plan in publicMetadata
  const userPlan = user?.publicMetadata?.plan || 'free';

  // Hide branding for Pro users
  if (userPlan === 'pro') {
    return null;
  }

  return <div className='text-xs opacity-60'>Made with Jovie</div>;
}
