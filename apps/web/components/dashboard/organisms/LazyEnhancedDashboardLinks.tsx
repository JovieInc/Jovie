'use client';

import dynamic from 'next/dynamic';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { ProfileSocialLink } from '@/app/app/(shell)/dashboard/actions/social-links';

const LAZY_ENHANCED_DASHBOARD_LINKS_LOADING_KEYS = Array.from(
  { length: 4 },
  (_, i) => `lazy-enhanced-links-loading-${i + 1}`
);

function LinksLoadingFallback() {
  return (
    <div className='space-y-6'>
      <div className='flex items-start gap-4'>
        <div className='h-20 w-20 rounded-full skeleton' />
        <div className='flex-1 space-y-2'>
          <div className='h-6 w-48 rounded skeleton' />
          <div className='h-4 w-32 rounded skeleton' />
        </div>
      </div>
      <div className='h-12 rounded-lg skeleton' />
      <div className='space-y-3'>
        {LAZY_ENHANCED_DASHBOARD_LINKS_LOADING_KEYS.map(key => (
          <div key={key} className='h-16 rounded-lg skeleton' />
        ))}
      </div>
    </div>
  );
}

function LinksErrorFallback() {
  return (
    <div className='rounded-lg border border-error bg-error-subtle p-6 text-center'>
      <p className='text-sm text-error'>
        Failed to load links editor. Please refresh the page to try again.
      </p>
    </div>
  );
}

interface LinksErrorBoundaryProps {
  readonly children: ReactNode;
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
  readonly initialLinks: ProfileSocialLink[];
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
