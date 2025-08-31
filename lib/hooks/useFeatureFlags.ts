'use client';

import { useEffect, useState } from 'react';
import { type FeatureFlags, getFeatureFlags } from '@/lib/feature-flags';

export function useFeatureFlags(): FeatureFlags {
  const [flags, setFlags] = useState<FeatureFlags>({
    artistSearchEnabled: true,
    debugBannerEnabled: false,
    tipPromoEnabled: true,
    pricingUseClerk: false,
    universalNotificationsEnabled: false,
    featureClickAnalyticsRpc: false,
    progressiveOnboardingEnabled: true,
    profileSettingsEnabled: true,
  });

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const featureFlags = await getFeatureFlags();
        setFlags(featureFlags);
      } catch (error) {
        console.error('Failed to fetch feature flags:', error);
        // Keep default values on error
      }
    };

    fetchFlags();
  }, []);

  return flags;
}
