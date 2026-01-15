'use client';

import dynamic from 'next/dynamic';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';

const LAZY_ENHANCED_DASHBOARD_LINKS_LOADING_KEYS = Array.from(
  { length: 4 },
  (_, i) => `lazy-enhanced-links-loading-${i + 1}`
);

const EnhancedDashboardLinks = dynamic(
  () =>
    import('@/components/dashboard/organisms/EnhancedDashboardLinks').then(
      mod => ({
        default: mod.EnhancedDashboardLinks,
      })
    ),
  {
    loading: () => (
      <div className='space-y-6'>
        <div className='flex items-start gap-4'>
          <div className='h-20 w-20 animate-pulse rounded-full bg-surface-1' />
          <div className='flex-1 space-y-2'>
            <div className='h-6 w-48 animate-pulse rounded bg-surface-1' />
            <div className='h-4 w-32 animate-pulse rounded bg-surface-1' />
          </div>
        </div>
        <div className='h-12 animate-pulse rounded-lg bg-surface-1' />
        <div className='space-y-3'>
          {LAZY_ENHANCED_DASHBOARD_LINKS_LOADING_KEYS.map(key => (
            <div
              key={key}
              className='h-16 animate-pulse rounded-lg bg-surface-1'
            />
          ))}
        </div>
      </div>
    ),
    ssr: false,
  }
);

export interface LazyEnhancedDashboardLinksProps {
  initialLinks: ProfileSocialLink[];
}

export function LazyEnhancedDashboardLinks({
  initialLinks,
}: LazyEnhancedDashboardLinksProps) {
  return <EnhancedDashboardLinks initialLinks={initialLinks} />;
}
