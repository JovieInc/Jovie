import { createScopedLogger } from '@/lib/utils/logger';

const log = createScopedLogger('FeatureFlags');

// Feature flags interface
export interface FeatureFlags {
  artistSearchEnabled: boolean;
  debugBannerEnabled: boolean;
  tipPromoEnabled: boolean;
  pricingUseClerk: boolean;
  universalNotificationsEnabled: boolean;
  // Gate new anonymous click logging via SECURITY DEFINER RPC
  featureClickAnalyticsRpc: boolean;
  // Progressive onboarding with multi-step UX improvements
  progressiveOnboardingEnabled: boolean;
  // Profile settings feature flag
  profileSettingsEnabled: boolean;
  // Advanced avatar uploader component with radial progress and drag/drop
  avatarUploaderEnabled?: boolean;
  // Minimalist design for onboarding screens (Apple-inspired)
  minimalistOnboardingEnabled?: boolean;
  // New Apple-style full-screen onboarding with improved UX (JOV-134)
  appleStyleOnboardingEnabled?: boolean;
}

// Default feature flags (fallback)
const defaultFeatureFlags: FeatureFlags = {
  artistSearchEnabled: true,
  // Debug banner is removed site-wide; keep flag for compatibility but default to false
  debugBannerEnabled: false,
  tipPromoEnabled: true,
  pricingUseClerk: false,
  // Universal notifications only enabled in development for now
  universalNotificationsEnabled: process.env.NODE_ENV === 'development',
  featureClickAnalyticsRpc: false,
  // Progressive onboarding enabled by default for better UX
  progressiveOnboardingEnabled: true,
  // Profile settings enabled by default
  profileSettingsEnabled: true,
  // Advanced avatar uploader disabled by default (requires feature flag)
  avatarUploaderEnabled: false,
  // Minimalist design for onboarding screens (Apple-inspired)
  minimalistOnboardingEnabled: true,
  // New Apple-style full-screen onboarding with improved UX (JOV-134)
  appleStyleOnboardingEnabled: true,
};

// Get feature flags (v4-compatible: attempts fetch from discovery endpoint)
export async function getFeatureFlags(): Promise<FeatureFlags> {
  // On the server, delegate to the robust absolute-URL variant
  if (typeof window === 'undefined') {
    return getServerFeatureFlags();
  }
  // On the client, prefer the internal app flags endpoint; fall back to Vercel discovery locally
  // 1) Try app-internal endpoint
  try {
    const res = await fetch('/api/feature-flags', { cache: 'no-store' });
    if (res.ok) {
      const data: Record<string, unknown> = await res.json();
      // New app-internal shape: direct booleans
      const hasRpcFlag =
        Object.prototype.hasOwnProperty.call(
          data,
          'featureClickAnalyticsRpc'
        ) ||
        Object.prototype.hasOwnProperty.call(
          data,
          'feature_click_analytics_rpc'
        );
      if (
        typeof data?.artistSearchEnabled !== 'undefined' ||
        typeof data?.debugBannerEnabled !== 'undefined' ||
        typeof data?.tipPromoEnabled !== 'undefined' ||
        typeof data?.universalNotificationsEnabled !== 'undefined' ||
        typeof data?.progressiveOnboardingEnabled !== 'undefined' ||
        typeof data?.profileSettingsEnabled !== 'undefined' ||
        hasRpcFlag
      ) {
        return {
          artistSearchEnabled: Boolean(
            data.artistSearchEnabled ?? defaultFeatureFlags.artistSearchEnabled
          ),
          debugBannerEnabled: Boolean(
            data.debugBannerEnabled ?? defaultFeatureFlags.debugBannerEnabled
          ),
          tipPromoEnabled: Boolean(
            data.tipPromoEnabled ?? defaultFeatureFlags.tipPromoEnabled
          ),
          pricingUseClerk: Boolean(
            data.pricingUseClerk ?? defaultFeatureFlags.pricingUseClerk
          ),
          universalNotificationsEnabled: Boolean(
            data.universalNotificationsEnabled ??
              defaultFeatureFlags.universalNotificationsEnabled
          ),
          progressiveOnboardingEnabled: Boolean(
            data.progressiveOnboardingEnabled ??
              defaultFeatureFlags.progressiveOnboardingEnabled
          ),
          featureClickAnalyticsRpc: Boolean(
            hasRpcFlag
              ? ((data as Record<string, unknown>)[
                  'featureClickAnalyticsRpc'
                ] ??
                  (data as Record<string, unknown>)[
                    'feature_click_analytics_rpc'
                  ])
              : defaultFeatureFlags.featureClickAnalyticsRpc
          ),
          profileSettingsEnabled: Boolean(
            (data as Record<string, unknown>).profileSettingsEnabled ??
              defaultFeatureFlags.profileSettingsEnabled
          ),
          avatarUploaderEnabled: Boolean(
            (data as Record<string, unknown>).avatarUploaderEnabled ??
              defaultFeatureFlags.avatarUploaderEnabled
          ),
        };
      }
    }
  } catch {
    // ignore
  }
  // 2) Fallback: try Vercel discovery (works in dev/local; may be blocked in Preview/Prod)
  try {
    const res2 = await fetch('/.well-known/vercel/flags', {
      cache: 'no-store',
    });
    if (res2.ok) {
      const data2 = (await res2.json()) as {
        version?: number;
        flags?: Record<string, { default?: unknown }>;
      };
      if (typeof data2?.version === 'number') {
        const rpcFlag =
          data2.flags?.['featureClickAnalyticsRpc']?.default ??
          data2.flags?.['feature_click_analytics_rpc']?.default;
        return {
          artistSearchEnabled: Boolean(
            data2.flags?.artistSearchEnabled?.default ??
              defaultFeatureFlags.artistSearchEnabled
          ),
          debugBannerEnabled: Boolean(
            data2.flags?.debugBannerEnabled?.default ??
              defaultFeatureFlags.debugBannerEnabled
          ),
          tipPromoEnabled: Boolean(
            data2.flags?.tipPromoEnabled?.default ??
              defaultFeatureFlags.tipPromoEnabled
          ),
          pricingUseClerk: Boolean(
            data2.flags?.pricingUseClerk?.default ??
              defaultFeatureFlags.pricingUseClerk
          ),
          universalNotificationsEnabled: Boolean(
            data2.flags?.universalNotificationsEnabled?.default ??
              defaultFeatureFlags.universalNotificationsEnabled
          ),
          featureClickAnalyticsRpc: Boolean(
            typeof rpcFlag !== 'undefined'
              ? rpcFlag
              : defaultFeatureFlags.featureClickAnalyticsRpc
          ),
          progressiveOnboardingEnabled: Boolean(
            data2.flags?.progressiveOnboardingEnabled?.default ??
              defaultFeatureFlags.progressiveOnboardingEnabled
          ),
          profileSettingsEnabled: defaultFeatureFlags.profileSettingsEnabled,
        };
      }
    }
  } catch {
    // ignore
  }
  return defaultFeatureFlags;
}

// Server-side function to get feature flags
export async function getServerFeatureFlags(
  _userId?: string
): Promise<FeatureFlags> {
  void _userId;
  try {
    // 1) Try app-internal endpoint
    const { headers } = await import('next/headers');
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto =
      h.get('x-forwarded-proto') ??
      (host && host.includes('localhost') ? 'http' : 'https');

    let localFlags: Partial<FeatureFlags> = {};

    if (host) {
      try {
        const url = `${proto}://${host}/api/feature-flags`;
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const data: Record<string, unknown> = await res.json();
          localFlags = {
            artistSearchEnabled: Boolean(data.artistSearchEnabled),
            debugBannerEnabled: Boolean(data.debugBannerEnabled),
            tipPromoEnabled: Boolean(data.tipPromoEnabled),
            pricingUseClerk: Boolean(data.pricingUseClerk),
            universalNotificationsEnabled: Boolean(
              data.universalNotificationsEnabled
            ),
            progressiveOnboardingEnabled: Boolean(
              data.progressiveOnboardingEnabled
            ),
            minimalistOnboardingEnabled: Boolean(
              data.minimalistOnboardingEnabled
            ),
            appleStyleOnboardingEnabled: Boolean(
              data.appleStyleOnboardingEnabled
            ),
            featureClickAnalyticsRpc: Boolean(
              data.featureClickAnalyticsRpc || data.feature_click_analytics_rpc
            ),
            profileSettingsEnabled: Boolean(data.profileSettingsEnabled),
            avatarUploaderEnabled: Boolean(data.avatarUploaderEnabled),
          };
        }
      } catch {
        // ignore fetch errors
      }
    }

    // 2) Merge flags with priority: Local > Defaults
    return {
      artistSearchEnabled:
        localFlags.artistSearchEnabled ??
        defaultFeatureFlags.artistSearchEnabled,
      debugBannerEnabled:
        localFlags.debugBannerEnabled ?? defaultFeatureFlags.debugBannerEnabled,
      tipPromoEnabled:
        localFlags.tipPromoEnabled ?? defaultFeatureFlags.tipPromoEnabled,
      pricingUseClerk:
        localFlags.pricingUseClerk ?? defaultFeatureFlags.pricingUseClerk,
      universalNotificationsEnabled:
        localFlags.universalNotificationsEnabled ??
        defaultFeatureFlags.universalNotificationsEnabled,
      featureClickAnalyticsRpc:
        localFlags.featureClickAnalyticsRpc ??
        defaultFeatureFlags.featureClickAnalyticsRpc,
      progressiveOnboardingEnabled:
        localFlags.progressiveOnboardingEnabled ??
        defaultFeatureFlags.progressiveOnboardingEnabled,
      minimalistOnboardingEnabled:
        localFlags.minimalistOnboardingEnabled ??
        defaultFeatureFlags.minimalistOnboardingEnabled,
      appleStyleOnboardingEnabled:
        localFlags.appleStyleOnboardingEnabled ??
        defaultFeatureFlags.appleStyleOnboardingEnabled,
      profileSettingsEnabled:
        localFlags.profileSettingsEnabled ??
        defaultFeatureFlags.profileSettingsEnabled,
      avatarUploaderEnabled:
        localFlags.avatarUploaderEnabled ??
        defaultFeatureFlags.avatarUploaderEnabled,
    };
  } catch (error) {
    log.warn('Server flags failed', { error });
    return defaultFeatureFlags;
  }
}
