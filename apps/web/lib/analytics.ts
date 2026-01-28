'use client';

import { publicEnv } from '@/lib/env-public';
import { logger } from '@/lib/utils/logger';

type AnalyticsKind = 'event' | 'page' | 'identify';

type AnalyticsWindow = Window & {
  __JOVIE_ANALYTICS_ENABLED__?: boolean;
  __JOVIE_ANALYTICS_READY__?: boolean;
};

const pendingEvents: Array<() => void> = [];
const MAX_PENDING_EVENTS = 100;
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
    // Limit pending events to prevent memory leaks if analytics never enables
    if (pendingEvents.length < MAX_PENDING_EVENTS) {
      pendingEvents.push(callback);
    }
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

    // NOTE: Removed window.va() calls - was causing 4M events/day ($100+/day)
    // <VercelAnalytics /> handles pageviews, we don't need custom events there

    // Track with Google Analytics (if available)
    if (analyticsWindow.gtag) {
      analyticsWindow.gtag('event', event, {
        ...(properties || {}),
        env: envTag,
      });
    }
  });
}

export function page(_name?: string, _properties?: Record<string, unknown>) {
  withAnalyticsGuard('page', _name, () => {
    // NOTE: Removed window.va() calls - <VercelAnalytics /> handles pageviews automatically
    // This was causing excessive events and costs
  });
}

export function identify(_userId: string, _traits?: Record<string, unknown>) {
  withAnalyticsGuard('identify', _userId, () => {
    // NOTE: Removed window.va() calls - was causing excessive events and costs
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
  return false;
}

export function useFeatureFlag(
  _flag: FeatureFlagName | string,
  defaultValue: boolean = false
): boolean {
  return defaultValue;
}

// Hook with loading state to prevent flash of content
export function useFeatureFlagWithLoading(
  _flag: FeatureFlagName | string,
  defaultValue: boolean = false
): { enabled: boolean; loading: boolean } {
  return { enabled: defaultValue, loading: false };
}
