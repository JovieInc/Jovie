'use client';

import { env as publicEnv } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

type AnalyticsKind = 'event' | 'page' | 'identify';

type AnalyticsWindow = Window & {
  __JOVIE_ANALYTICS_ENABLED__?: boolean;
  __JOVIE_ANALYTICS_READY__?: boolean;
};

const pendingEvents: Array<() => void> = [];
const skipReasonsLogged = new Set<string>();

function getAnalyticsWindow(): AnalyticsWindow | null {
  if (typeof window === 'undefined') return null;
  return window as AnalyticsWindow;
}

function hasStatsigClientKey() {
  return Boolean(publicEnv.NEXT_PUBLIC_STATSIG_CLIENT_KEY);
}

function logSkip(
  kind: AnalyticsKind,
  name: string | undefined,
  reason: string
) {
  if (!logger.enabled) return;
  const key = `${kind}:${reason}`;
  if (skipReasonsLogged.has(key)) return;
  skipReasonsLogged.add(key);
  logger.debug('Analytics suppressed', { kind, name, reason }, 'analytics');
}

function getAnalyticsState() {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow) {
    return { enabled: false, ready: false, reason: 'no-window' };
  }

  if (!hasStatsigClientKey()) {
    return { enabled: false, ready: true, reason: 'missing-statsig-key' };
  }

  const ready = Boolean(analyticsWindow.__JOVIE_ANALYTICS_READY__);
  const enabled = Boolean(analyticsWindow.__JOVIE_ANALYTICS_ENABLED__);

  if (!ready) {
    return { enabled: false, ready: false, reason: 'pending-analytics-gate' };
  }

  if (!enabled) {
    return { enabled: false, ready: true, reason: 'analytics-gate-disabled' };
  }

  return { enabled: true, ready: true, reason: undefined };
}

function flushQueue() {
  while (pendingEvents.length) {
    const event = pendingEvents.shift();
    event?.();
  }
}

function withAnalyticsGuard(
  kind: AnalyticsKind,
  name: string | undefined,
  callback: () => void
) {
  const state = getAnalyticsState();

  if (state.enabled) {
    callback();
    return;
  }

  if (!state.ready && hasStatsigClientKey()) {
    pendingEvents.push(callback);
    return;
  }

  logSkip(kind, name, state.reason ?? 'unknown');
}

export function setAnalyticsEnabled(enabled: boolean) {
  const analyticsWindow = getAnalyticsWindow();
  if (!analyticsWindow) return;

  analyticsWindow.__JOVIE_ANALYTICS_READY__ = true;
  analyticsWindow.__JOVIE_ANALYTICS_ENABLED__ = enabled;

  if (enabled) {
    flushQueue();
  } else {
    pendingEvents.length = 0;
  }
}

// Type definitions for analytics

// Extend window interface for analytics
declare global {
  interface Window {
    __JOVIE_ANALYTICS_ENABLED__?: boolean;
    __JOVIE_ANALYTICS_READY__?: boolean;
    va?: (event: string, data: Record<string, unknown>) => void;
    gtag?: (
      command: string,
      event: string,
      properties?: Record<string, unknown>
    ) => void;
  }
}

export function track(event: string, properties?: Record<string, unknown>) {
  withAnalyticsGuard('event', event, () => {
    const analyticsWindow = getAnalyticsWindow();
    if (!analyticsWindow) return;

    const envTag = (() => {
      try {
        const prodHost = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname;
        const host = analyticsWindow.location.hostname;
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
    if (analyticsWindow.va) {
      analyticsWindow.va('event', {
        name: event,
        properties: { ...(properties || {}), env: envTag },
      });
    }

    // Track with Google Analytics (if available)
    if (analyticsWindow.gtag) {
      analyticsWindow.gtag('event', event, {
        ...(properties || {}),
        env: envTag,
      });
    }
  });
}

export function page(name?: string, properties?: Record<string, unknown>) {
  withAnalyticsGuard('page', name, () => {
    const analyticsWindow = getAnalyticsWindow();
    if (!analyticsWindow) return;

    const envTag = (() => {
      try {
        const prodHost = new URL(publicEnv.NEXT_PUBLIC_APP_URL).hostname;
        const host = analyticsWindow.location.hostname;
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
    if (analyticsWindow.va) {
      analyticsWindow.va('page_view', {
        name,
        properties: { ...(properties || {}), env: envTag },
      });
    }
  });
}

export function identify(userId: string, traits?: Record<string, unknown>) {
  withAnalyticsGuard('identify', userId, () => {
    const analyticsWindow = getAnalyticsWindow();
    if (!analyticsWindow) return;

    // Track with Vercel Analytics (if available)
    if (analyticsWindow.va) {
      analyticsWindow.va('identify', {
        userId,
        traits,
      });
    }
  });
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
