import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Simple, cache-safe internal flags endpoint for app use
export async function GET() {
  const flags = {
    artistSearchEnabled: true,
    debugBannerEnabled: false,
    tipPromoEnabled: true,
    pricingUseClerk: false,
    universalNotificationsEnabled: process.env.NODE_ENV === 'development',
    // Gate for anonymous click logging via SECURITY DEFINER RPC
    featureClickAnalyticsRpc: false,
    // snake_case alias for internal consistency with feature flag naming policy
    feature_click_analytics_rpc: false,
    // Progressive onboarding with multi-step UX improvements
    progressiveOnboardingEnabled: true,
    // Minimalist design for onboarding screens (Apple-inspired)
    minimalistOnboardingEnabled: true,
    // New Apple-style full-screen onboarding with improved UX (JOV-134)
    appleStyleOnboardingEnabled: true,
    profileSettingsEnabled: true,
  } as const;

  return new NextResponse(JSON.stringify(flags), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
