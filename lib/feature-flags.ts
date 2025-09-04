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
  // Avatar upload with Vercel Blob integration
  avatarUploadEnabled?: boolean;
  // Minimalist design for onboarding screens (Apple-inspired)
  minimalistOnboardingEnabled?: boolean;
  // New Apple-style full-screen onboarding with improved UX (JOV-134)
  appleStyleOnboardingEnabled?: boolean;
}

// PostHog feature flag names (match what's defined in PostHog dashboard)
export const POSTHOG_FLAGS = {
  ARTIST_SEARCH_ENABLED: 'feature_artist_search_enabled',
  DEBUG_BANNER_ENABLED: 'feature_debug_banner_enabled',
  TIP_PROMO_ENABLED: 'feature_tip_promo_enabled',
  PRICING_USE_CLERK: 'feature_pricing_use_clerk',
  UNIVERSAL_NOTIFICATIONS_ENABLED: 'feature_universal_notifications_enabled',
  FEATURE_CLICK_ANALYTICS_RPC: 'feature_click_analytics_rpc',
  PROGRESSIVE_ONBOARDING_ENABLED: 'feature_progressive_onboarding_enabled',
  MINIMALIST_ONBOARDING_ENABLED: 'feature_minimalist_onboarding_enabled',
  APPLE_STYLE_ONBOARDING_ENABLED: 'feature_apple_style_onboarding_enabled',
  PROFILE_SETTINGS_ENABLED: 'feature_profile_settings',
  AVATAR_UPLOAD_ENABLED: 'feature_avatar_upload',
} as const;

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
  // Avatar upload disabled by default (requires Vercel Blob setup)
  avatarUploadEnabled: false,
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
        typeof data?.avatarUploadEnabled !== 'undefined' ||
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
          avatarUploadEnabled: Boolean(
            (data as Record<string, unknown>).avatarUploadEnabled ??
              defaultFeatureFlags.avatarUploadEnabled
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
          avatarUploadEnabled: Boolean(
            data2.flags?.avatarUploadEnabled?.default ??
              defaultFeatureFlags.avatarUploadEnabled
          ),
        };
      }
    }
  } catch {
    // ignore
  }
  return defaultFeatureFlags;
}

// Server-side PostHog feature flag helper
async function getPostHogServerFlags(
  userId?: string
): Promise<Partial<FeatureFlags>> {
  try {
    // Dynamically import PostHog to avoid bundling in client
    const { PostHog } = await import('posthog-node');
    const { ANALYTICS } = await import('@/constants/app');

    if (!ANALYTICS.posthogKey) {
      return {};
    }

    const client = new PostHog(ANALYTICS.posthogKey, {
      host: ANALYTICS.posthogHost || 'https://us.posthog.com',
    });

    const distinctId = userId || 'anonymous';

    // Check each PostHog feature flag
    const [
      artistSearchEnabled,
      debugBannerEnabled,
      tipPromoEnabled,
      pricingUseClerk,
      universalNotificationsEnabled,
      featureClickAnalyticsRpc,
      progressiveOnboardingEnabled,
      minimalistOnboardingEnabled,
      appleStyleOnboardingEnabled,
      profileSettingsEnabled,
      avatarUploadEnabled,
    ] = await Promise.all([
      client.isFeatureEnabled(POSTHOG_FLAGS.ARTIST_SEARCH_ENABLED, distinctId),
      client.isFeatureEnabled(POSTHOG_FLAGS.DEBUG_BANNER_ENABLED, distinctId),
      client.isFeatureEnabled(POSTHOG_FLAGS.TIP_PROMO_ENABLED, distinctId),
      client.isFeatureEnabled(POSTHOG_FLAGS.PRICING_USE_CLERK, distinctId),
      client.isFeatureEnabled(
        POSTHOG_FLAGS.UNIVERSAL_NOTIFICATIONS_ENABLED,
        distinctId
      ),
      client.isFeatureEnabled(
        POSTHOG_FLAGS.FEATURE_CLICK_ANALYTICS_RPC,
        distinctId
      ),
      client.isFeatureEnabled(
        POSTHOG_FLAGS.PROGRESSIVE_ONBOARDING_ENABLED,
        distinctId
      ),
      client.isFeatureEnabled(
        POSTHOG_FLAGS.MINIMALIST_ONBOARDING_ENABLED,
        distinctId
      ),
      client.isFeatureEnabled(
        POSTHOG_FLAGS.APPLE_STYLE_ONBOARDING_ENABLED,
        distinctId
      ),
      client.isFeatureEnabled(
        POSTHOG_FLAGS.PROFILE_SETTINGS_ENABLED,
        distinctId
      ),
      client.isFeatureEnabled(POSTHOG_FLAGS.AVATAR_UPLOAD_ENABLED, distinctId),
    ]);

    await client.shutdown();

    return {
      ...(typeof artistSearchEnabled === 'boolean' && { artistSearchEnabled }),
      ...(typeof debugBannerEnabled === 'boolean' && { debugBannerEnabled }),
      ...(typeof tipPromoEnabled === 'boolean' && { tipPromoEnabled }),
      ...(typeof pricingUseClerk === 'boolean' && { pricingUseClerk }),
      ...(typeof universalNotificationsEnabled === 'boolean' && {
        universalNotificationsEnabled,
      }),
      ...(typeof featureClickAnalyticsRpc === 'boolean' && {
        featureClickAnalyticsRpc,
      }),
      ...(typeof progressiveOnboardingEnabled === 'boolean' && {
        progressiveOnboardingEnabled,
      }),
      ...(typeof minimalistOnboardingEnabled === 'boolean' && {
        minimalistOnboardingEnabled,
      }),
      ...(typeof appleStyleOnboardingEnabled === 'boolean' && {
        appleStyleOnboardingEnabled,
      }),
      ...(typeof profileSettingsEnabled === 'boolean' && {
        profileSettingsEnabled,
      }),
      ...(typeof avatarUploadEnabled === 'boolean' && {
        avatarUploadEnabled,
      }),
    };
  } catch (error) {
    console.warn('[Feature Flags] PostHog server flags failed:', error);
    return {};
  }
}

// Server-side function to get feature flags
export async function getServerFeatureFlags(
  userId?: string
): Promise<FeatureFlags> {
  try {
    // 1) Try PostHog server-side feature flags first
    const postHogFlags = await getPostHogServerFlags(userId);

    // 2) Try app-internal endpoint as fallback
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
            avatarUploadEnabled: Boolean(data.avatarUploadEnabled),
          };
        }
      } catch {
        // ignore fetch errors
      }
    }

    // 3) Merge flags with priority: PostHog > Local > Defaults
    return {
      artistSearchEnabled:
        postHogFlags.artistSearchEnabled ??
        localFlags.artistSearchEnabled ??
        defaultFeatureFlags.artistSearchEnabled,
      debugBannerEnabled:
        postHogFlags.debugBannerEnabled ??
        localFlags.debugBannerEnabled ??
        defaultFeatureFlags.debugBannerEnabled,
      tipPromoEnabled:
        postHogFlags.tipPromoEnabled ??
        localFlags.tipPromoEnabled ??
        defaultFeatureFlags.tipPromoEnabled,
      pricingUseClerk:
        postHogFlags.pricingUseClerk ??
        localFlags.pricingUseClerk ??
        defaultFeatureFlags.pricingUseClerk,
      universalNotificationsEnabled:
        postHogFlags.universalNotificationsEnabled ??
        localFlags.universalNotificationsEnabled ??
        defaultFeatureFlags.universalNotificationsEnabled,
      featureClickAnalyticsRpc:
        postHogFlags.featureClickAnalyticsRpc ??
        localFlags.featureClickAnalyticsRpc ??
        defaultFeatureFlags.featureClickAnalyticsRpc,
      progressiveOnboardingEnabled:
        postHogFlags.progressiveOnboardingEnabled ??
        localFlags.progressiveOnboardingEnabled ??
        defaultFeatureFlags.progressiveOnboardingEnabled,
      minimalistOnboardingEnabled:
        postHogFlags.minimalistOnboardingEnabled ??
        localFlags.minimalistOnboardingEnabled ??
        defaultFeatureFlags.minimalistOnboardingEnabled,
      appleStyleOnboardingEnabled:
        postHogFlags.appleStyleOnboardingEnabled ??
        localFlags.appleStyleOnboardingEnabled ??
        defaultFeatureFlags.appleStyleOnboardingEnabled,
      profileSettingsEnabled:
        postHogFlags.profileSettingsEnabled ??
        localFlags.profileSettingsEnabled ??
        defaultFeatureFlags.profileSettingsEnabled,
      avatarUploadEnabled:
        postHogFlags.avatarUploadEnabled ??
        localFlags.avatarUploadEnabled ??
        defaultFeatureFlags.avatarUploadEnabled,
    };
  } catch (error) {
    console.warn('[Feature Flags] Server flags failed:', error);
    return defaultFeatureFlags;
  }
}
