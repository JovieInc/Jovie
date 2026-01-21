'use client';

import dynamic from 'next/dynamic';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ProfileSocialLink } from '@/app/app/dashboard/actions/social-links';

const LAZY_ENHANCED_DASHBOARD_LINKS_LOADING_KEYS = Array.from(
  { length: 4 },
  (_, i) => `lazy-enhanced-links-loading-${i + 1}`
);

function LinksLoadingFallback() {
  return (
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
  );
}

function LinksErrorFallback() {
  return (
    <div className='rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900 dark:bg-red-950'>
      <p className='text-sm text-red-600 dark:text-red-400'>
        Failed to load links editor. Please refresh the page to try again.
      </p>
    </div>
  );
}

interface LinksErrorBoundaryProps {
  children: ReactNode;
}

interface LinksErrorBoundaryState {
  hasError: boolean;
}

class LinksErrorBoundary extends Component<
  LinksErrorBoundaryProps,
  LinksErrorBoundaryState
> {
  constructor(props: LinksErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): LinksErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('LazyEnhancedDashboardLinks error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <LinksErrorFallback />;
    }

    return this.props.children;
  }
}

const EnhancedDashboardLinks = dynamic(
  () =>
    import('@/components/dashboard/organisms/EnhancedDashboardLinks').then(
      mod => ({
        default: mod.EnhancedDashboardLinks,
      })
    ),
  {
    loading: LinksLoadingFallback,
    ssr: false,
  }
);

export interface LazyEnhancedDashboardLinksProps {
  initialLinks: ProfileSocialLink[];
}

export function LazyEnhancedDashboardLinks({
  initialLinks,
}: LazyEnhancedDashboardLinksProps) {
  return (
    <LinksErrorBoundary>
      <EnhancedDashboardLinks initialLinks={initialLinks} />
    </LinksErrorBoundary>
  );
}
