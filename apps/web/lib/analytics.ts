'use client';

import { publicEnv } from '@/lib/env-public';

type AnalyticsWindow = Window & {
  gtag?: (
    command: string,
    event: string,
    properties?: Record<string, unknown>
  ) => void;
};

function getAnalyticsWindow(): AnalyticsWindow | null {
  if (typeof window === 'undefined') return null;
  return window as AnalyticsWindow;
}

function getEnvTag(host: string): 'dev' | 'prod' | 'preview' {
  try {
    const prodHost = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) {
      return 'dev';
    }
    if (host === prodHost || host === `www.${prodHost}`) {
      return 'prod';
    }
    return 'preview';
  } catch {
    return process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow?.gtag) return;

  const envTag = getEnvTag(analyticsWindow.location.hostname);

  analyticsWindow.gtag('event', event, {
    ...(properties || {}),
    env: envTag,
  });
}

export function page(name?: string, properties?: Record<string, unknown>) {
  void name;
  void properties;
  // Vercel Analytics handles pageviews; we just ensure the module is imported
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  void userId;
  void traits;
}

// Feature flag constants for type safety
export const FEATURE_FLAGS = {
  CLAIM_HANDLE: 'feature_claim_handle',
  BILLING_UPGRADE_DIRECT: 'billing.upgradeDirect',
} as const;

export type FeatureFlagName =
  (typeof FEATURE_FLAGS)[keyof typeof FEATURE_FLAGS];

// Lightweight feature flag helpers (client-only)
// Use defaultValue for safe rendering before flags load
export function isFeatureEnabled(_flag: FeatureFlagName | string): boolean {
  void _flag;
  return false;
}

export function useFeatureFlag(
  _flag: FeatureFlagName | string,
  defaultValue: boolean = false
): boolean {
  void _flag;
  return defaultValue;
}

// Hook with loading state to prevent flash of content
export function useFeatureFlagWithLoading(
  _flag: FeatureFlagName | string,
  defaultValue: boolean = false
): { enabled: boolean; loading: boolean } {
  void _flag;
  return { enabled: defaultValue, loading: false };
}
