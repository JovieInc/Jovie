'use client';

import Script from 'next/script';
import { useCallback, useEffect, useId, useRef } from 'react';
import { publicEnv } from '@/lib/env-public';

/**
 * Invisible Cloudflare Turnstile for public forms (changelog subscribe, etc.).
 *
 * Renders an execute-mode widget off-screen. The token is delivered via
 * `onToken` and should be posted with the form submission. In dev/E2E the
 * widget is skipped and a deterministic bypass token is issued instead.
 *
 * Window.turnstile types are declared in OnboardingTurnstile.tsx.
 */

const LOCAL_DEV_BYPASS_TOKEN = 'local-dev-turnstile-bypass';

interface InvisibleTurnstileProps {
  readonly onToken: (token: string) => void;
  readonly resetSignal?: number;
}

function getTurnstile() {
  return globalThis.window.turnstile;
}

export function isTurnstileClientBypassed(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1'
  );
}

export function isTurnstileClientConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export function InvisibleTurnstile({
  onToken,
  resetSignal = 0,
}: InvisibleTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const lastResetSignalRef = useRef(resetSignal);
  const widgetDomId = useId();
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const shouldBypass = isTurnstileClientBypassed();

  const clearWidget = useCallback(() => {
    const widgetId = widgetIdRef.current;
    const turnstile = getTurnstile();
    if (widgetId && turnstile) {
      try {
        turnstile.remove(widgetId);
      } catch {
        // Widget already torn down.
      }
    }
    widgetIdRef.current = null;
    if (containerRef.current) {
      containerRef.current.replaceChildren();
    }
  }, []);

  const render = useCallback(() => {
    if (shouldBypass || !siteKey) return;
    const turnstile = getTurnstile();
    if (!containerRef.current || !turnstile) return;
    if (widgetIdRef.current) return;

    try {
      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        appearance: 'execute',
        size: 'compact',
        theme: 'auto',
        callback: token => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
        'timeout-callback': () => onToken(''),
        'unsupported-callback': () => onToken(''),
      });
    } catch {
      onToken('');
    }
  }, [onToken, shouldBypass, siteKey]);

  const resetWidget = useCallback(() => {
    clearWidget();
    onToken('');
    render();
  }, [clearWidget, onToken, render]);

  useEffect(() => {
    if (shouldBypass) {
      onToken(LOCAL_DEV_BYPASS_TOKEN);
      return;
    }
    if (!siteKey) return;

    const turnstile = getTurnstile();
    if (turnstile) {
      render();
    }

    return () => {
      clearWidget();
    };
  }, [clearWidget, onToken, render, shouldBypass, siteKey]);

  useEffect(() => {
    if (lastResetSignalRef.current === resetSignal) return;
    lastResetSignalRef.current = resetSignal;
    resetWidget();
  }, [resetSignal, resetWidget]);

  if (shouldBypass || !siteKey) {
    return null;
  }

  return (
    <>
      <Script
        src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
        strategy='afterInteractive'
        onLoad={() => render()}
      />
      <div
        ref={containerRef}
        id={`cf-turnstile-${widgetDomId}`}
        className='sr-only h-0 overflow-hidden'
        aria-hidden='true'
        data-testid='invisible-turnstile-widget'
      />
    </>
  );
}
