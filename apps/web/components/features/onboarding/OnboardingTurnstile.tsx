'use client';

import Script from 'next/script';
import { useCallback, useEffect, useId, useRef } from 'react';
import { publicEnv } from '@/lib/env-public';

/**
 * Cloudflare Turnstile widget for the onboarding chat (JOV-2132 PR 3).
 *
 * Loads the Turnstile script and mounts an invisible/managed widget. The
 * resulting token is passed back via `onToken`, then consumed by the chat
 * client on the first /api/chat POST in `mode='onboarding'`. Subsequent
 * messages within the same session rely on the signed session cookie + the
 * session-lifetime rate limiter and do NOT re-verify.
 *
 * In local development, the widget short-circuits and the chat handler's
 * dev-mode skip kicks in.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (
        target: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: (code: string) => void;
          'expired-callback'?: () => void;
          appearance?: 'always' | 'execute' | 'interaction-only';
          size?: 'normal' | 'flexible' | 'compact' | 'invisible';
          theme?: 'auto' | 'light' | 'dark';
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

interface OnboardingTurnstileProps {
  readonly onToken: (token: string) => void;
  readonly onError: (message: string) => void;
}

const LOCAL_DEV_BYPASS_TOKEN = 'local-dev-turnstile-bypass';

export function OnboardingTurnstile({
  onToken,
  onError,
}: OnboardingTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const widgetDomId = useId();
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const shouldBypassTurnstile = process.env.NODE_ENV === 'development';

  const render = useCallback(() => {
    if (shouldBypassTurnstile || !siteKey) return; // local fallback handled server-side
    if (!containerRef.current || !window.turnstile) return;
    if (widgetIdRef.current) return; // already rendered
    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        size: 'invisible',
        appearance: 'interaction-only',
        theme: 'dark',
        callback: token => onToken(token),
        'error-callback': code =>
          onError(`bot challenge failed (${code}). try refreshing.`),
        'expired-callback': () => {
          if (widgetIdRef.current) {
            window.turnstile?.reset(widgetIdRef.current);
          }
        },
      });
    } catch (err) {
      onError('turnstile failed to load');
      console.error('[onboarding] turnstile render error', err);
    }
  }, [onToken, onError, shouldBypassTurnstile, siteKey]);

  useEffect(() => {
    if (shouldBypassTurnstile) {
      onToken(LOCAL_DEV_BYPASS_TOKEN);
      return;
    }
    if (!siteKey) {
      onError('turnstile is not configured');
      return;
    }
    if (window.turnstile) {
      render();
    }
    return () => {
      const id = widgetIdRef.current;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // ignore — widget already torn down
        }
      }
    };
  }, [onError, onToken, render, shouldBypassTurnstile, siteKey]);

  if (shouldBypassTurnstile || !siteKey) {
    // No Turnstile UI in dev, and no challenge UI can be rendered without a
    // site key. The server remains fail-closed outside local development.
    return null;
  }

  return (
    <>
      <Script
        src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        strategy='afterInteractive'
        onLoad={() => render()}
      />
      <div ref={containerRef} id={`cf-turnstile-${widgetDomId}`} aria-hidden />
    </>
  );
}
