'use client';

import { useEffect } from 'react';
import {
  FEATURE_FLAGS,
  track,
  useFeatureFlagWithLoading,
} from '@/lib/analytics';

export default function LoadingView() {
  // Feature flag to enable enhanced loading visuals
  const { enabled: enhanced, loading } = useFeatureFlagWithLoading(
    FEATURE_FLAGS.DARK_MODE_APP_SHELL_LOADING,
    false
  );

  useEffect(() => {
    track('app_shell_loading_view');
  }, []);

  // Base container uses design tokens; no hardcoded colors
  const Container = ({ children }: { children: React.ReactNode }) => (
    <div className='min-h-dvh grid place-items-center bg-base text-primary'>
      {children}
    </div>
  );

  // While flag is resolving, show simple, accessible fallback
  if (loading || !enhanced) {
    return (
      <Container>
        <div className='flex items-center gap-3'>
          <span className='size-2 rounded-full bg-current motion-safe:animate-ping' />
          <span className='text-sm tracking-wide'>Loading…</span>
        </div>
      </Container>
    );
  }

  // Enhanced variant (behind feature flag)
  return (
    <Container>
      <div className='flex items-center gap-3'>
        <span className='size-3 rounded-full bg-current motion-safe:animate-ping' />
        <span className='text-sm tracking-wide'>Loading…</span>
      </div>
    </Container>
  );
}
