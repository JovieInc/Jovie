'use client';

import { env as publicEnv } from '@/lib/env';

// Type definitions for analytics

// Extend window interface for analytics
declare global {
  interface Window {
    va?: (event: string, data: Record<string, unknown>) => void;
    gtag?: (
      command: string,
      event: string,
      properties?: Record<string, unknown>
    ) => void;
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  const envTag = (() => {
    try {
      const prodHost = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname;
      const host = window.location.hostname;
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.local')
      ) {
        return 'dev';
      }
      if (host === prodHost || host === `www.${prodHost}`) {
        return 'prod';
      }
      return 'preview';
    } catch {
      return process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    }
  })();

  // Track with Vercel Analytics (if available)
  if (window.va) {
    window.va('event', {
      name: event,
      properties: { ...(properties || {}), env: envTag },
    });
  }

  // Track with Google Analytics (if available)
  if (window.gtag) {
    window.gtag('event', event, { ...(properties || {}), env: envTag });
  }
}

export function page(name?: string, properties?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  const envTag = (() => {
    try {
      const prodHost = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname;
      const host = window.location.hostname;
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.local')
      ) {
        return 'dev';
      }
      if (host === prodHost || host === `www.${prodHost}`) {
        return 'prod';
      }
      return 'preview';
    } catch {
      return process.env.NODE_ENV === 'development' ? 'dev' : 'prod';
    }
  })();

  // Track with Vercel Analytics (if available)
  if (window.va) {
    window.va('page_view', {
      name,
      properties: { ...(properties || {}), env: envTag },
    });
  }
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  // Track with Vercel Analytics (if available)
  if (window.va) {
    window.va('identify', {
      userId,
      traits,
    });
  }
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
