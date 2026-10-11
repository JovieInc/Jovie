'use client';

import { useEffect } from 'react';
import { LISTEN_COOKIE } from '@/constants/app';
import { PROVIDER_CONFIG } from '@/lib/discography/config';
import type { ProviderKey } from '@/lib/discography/types';
import { postJsonBeacon } from '@/lib/tracking/json-beacon';
import { appendUTMParamsToUrl, extractUTMParams } from '@/lib/utm';

interface PreferredDspRedirectProps {
  /** Provider links available for this content, used to validate the preference */
  readonly providerLinks: ReadonlyArray<{ providerId: string; url: string }>;
  /** Artist handle for analytics tracking */
  readonly artistHandle: string | null;
  /** Tracking context for analytics */
  readonly tracking?: {
    readonly contentType: 'release' | 'track';
    readonly contentId: string;
    readonly smartLinkSlug?: string | null;
  };
}

/**
 * Session-scoped flag marking that this SmartLink already consumed its
 * one-shot automatic redirect. Deliberate revisits (in-app nav, browser Back,
 * reloads within the tab session) render the page instead of looping back to
 * the DSP. Keyed by pathname so release and track SmartLinks are independent.
 */
function autoRedirectStorageKey(pathname: string): string {
  return `jovie:smartlink:auto-redirected:${pathname}`;
}

function readSessionFlag(key: string): boolean {
  try {
    return globalThis.sessionStorage?.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string): void {
  try {
    globalThis.sessionStorage?.setItem(key, '1');
  } catch {
    // Storage unavailable (private mode, quota) — redirect still fires once.
  }
}

/**
 * True when this page load is a history traversal (Back/Forward) or a BFCache
 * restore. Returning to the SmartLink is explicit evidence the user wants the
 * Jovie surface, so inferred redirect intent must not fire again.
 */
function isHistoryTraversal(): boolean {
  try {
    const entry = globalThis.performance?.getEntriesByType?.(
      'navigation'
    )?.[0] as PerformanceNavigationTiming | undefined;
    if (entry?.type === 'back_forward') return true;
  } catch {
    // Performance API unavailable — fall through to the session flag.
  }
  return false;
}

function readListenCookie(): string | undefined {
  const cookieEntry = document.cookie
    .split(';')
    .find(cookie => cookie.trim().startsWith(`${LISTEN_COOKIE}=`));
  return cookieEntry
    ? cookieEntry.slice(cookieEntry.indexOf('=') + 1).trim()
    : undefined;
}

/**
 * Client component that reads the user's preferred DSP from the cookie
 * and redirects to that provider if available. This runs on the client
 * to preserve ISR caching on the server page.
 *
 * Preference is durable (cookie); inferred redirect intent is not. An
 * automatic redirect fires at most once per SmartLink per tab session and is
 * suppressed entirely on history traversals, so browser Back always renders
 * the page. Explicit `?dsp=` taps are user intent and always redirect.
 */
export function PreferredDspRedirect({
  providerLinks,
  artistHandle,
  tracking,
}: PreferredDspRedirectProps) {
  useEffect(() => {
    const searchParams = new URLSearchParams(globalThis.location.search);
    const explicitProvider = searchParams.get('dsp');
    const shouldSkipPreferredRedirect = searchParams.get('noredirect') === '1';

    const cookieValue = readListenCookie();

    const providerKey = (explicitProvider ??
      (shouldSkipPreferredRedirect ? null : cookieValue)) as ProviderKey | null;
    if (!providerKey) return;

    // Validate the provider exists in our config and is available for this content
    if (!PROVIDER_CONFIG[providerKey]) return;

    const matchingLink = providerLinks.find(
      link => link.providerId === providerKey
    );
    if (!matchingLink?.url) return;

    const isAutomaticRedirect = !explicitProvider;
    if (isAutomaticRedirect) {
      const storageKey = autoRedirectStorageKey(globalThis.location.pathname);
      if (isHistoryTraversal() || readSessionFlag(storageKey)) return;
      writeSessionFlag(storageKey);
    }

    if (artistHandle && tracking?.contentId && tracking?.contentType) {
      postJsonBeacon(
        '/api/track',
        {
          handle: artistHandle,
          linkType: 'listen',
          target: providerKey,
          source: explicitProvider ? 'redirect' : 'preferred_dsp',
          context: {
            contentType: tracking.contentType,
            contentId: tracking.contentId,
            provider: providerKey,
            smartLinkSlug: tracking.smartLinkSlug ?? undefined,
          },
        },
        () => {}
      );
    }

    globalThis.location.replace(
      appendUTMParamsToUrl(matchingLink.url, extractUTMParams(searchParams))
    );
  }, [artistHandle, providerLinks, tracking]);

  return null;
}
