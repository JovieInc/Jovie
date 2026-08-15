'use client';

import { useEffect, useState } from 'react';
import { CookieBannerSection } from '@/components/organisms/CookieBannerSection';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { MarketingStateRenderClient } from '../[state]/MarketingStateRenderClient';

export function ProfileAdmissionFixtureClient() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  return (
    <QueryProvider>
      <MarketingStateRenderClient stateId='mock-home' interactive />
      <CookieBannerSection testOnlyPathname='/profile-admission-fixture' />
    </QueryProvider>
  );
}
