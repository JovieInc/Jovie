'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { FeatureFlags } from '@/lib/feature-flags';

interface FeatureFlagsContextType {
  flags: FeatureFlags;
  isLoading: boolean;
  error: string | null;
}

const FeatureFlagsContext = createContext<FeatureFlagsContextType>({
  flags: {
    artistSearchEnabled: true,
    debugBannerEnabled: false, // UI banner removed; keep flag for compatibility
    tipPromoEnabled: true,
    pricingUseClerk: false,
    universalNotificationsEnabled: false,
    featureClickAnalyticsRpc: false,
    progressiveOnboardingEnabled: true,
    profileSettingsEnabled: true,
  },
  isLoading: true,
  error: null,
});

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

interface FeatureFlagsProviderProps {
  children: React.ReactNode;
  initialFlags?: FeatureFlags;
}

export function FeatureFlagsProvider({
  children,
  initialFlags,
}: FeatureFlagsProviderProps) {
  const [flags, setFlags] = useState<FeatureFlags>(
    initialFlags || {
      artistSearchEnabled: true,
      debugBannerEnabled: false, // UI banner removed; keep flag for compatibility
      tipPromoEnabled: true,
      pricingUseClerk: false,
      universalNotificationsEnabled: false,
      featureClickAnalyticsRpc: false,
      progressiveOnboardingEnabled: true,
      profileSettingsEnabled: true,
    }
  );
  const [isLoading, setIsLoading] = useState(!initialFlags);

  useEffect(() => {
    if (initialFlags) {
      // If we have initial flags from server, use them
      setFlags(initialFlags);
      setIsLoading(false);
    } else {
      // For now, use default flags on client side
      // In the future, we can implement real-time Statsig updates
      setIsLoading(false);
    }
  }, [initialFlags]);

  return (
    <FeatureFlagsContext.Provider value={{ flags, isLoading, error: null }}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}
