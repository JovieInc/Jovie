'use client';

import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { publicEnv } from '@/lib/env-public';

/**
 * Invisible Cloudflare Turnstile for public forms (changelog subscribe, etc.).
 *
 * Renders an execute-mode widget off-screen. The token is delivered via
 * `onToken` and should be posted with the form submission. In dev, E2E, and
 * deterministic Storybook runtimes the widget is skipped and a bypass token
 * is issued instead.
 *
 * Window.turnstile types are declared in OnboardingTurnstile.tsx.
 */

const LOCAL_DEV_BYPASS_TOKEN = 'local-dev-turnstile-bypass';
const TURNSTILE_LOAD_TIMEOUT_MS = 10_000;

interface InvisibleTurnstileProps {
  readonly onToken: (token: string) => void;
  readonly onStateChange?: (state: InvisibleTurnstileState) => void;
  readonly resetSignal?: number;
}

export type InvisibleTurnstileStatus =
  | 'loading'
  | 'verified'
  | 'expired'
  | 'timeout'
  | 'error'
  | 'unsupported'
  | 'interactive'
  | 'bypassed'
  | 'unconfigured';

export interface InvisibleTurnstileState {
  readonly status: InvisibleTurnstileStatus;
  readonly message?: string;
}

function getTurnstile() {
  return globalThis.window.turnstile;
}

function isStorybookRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (
      globalThis.window as Window & {
        __jovieStorybookFixtures?: boolean;
      }
    ).__jovieStorybookFixtures
  );
}

export function isTurnstileClientBypassed(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    isStorybookRuntime()
  );
}

export function isTurnstileClientConfigured(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}

export function InvisibleTurnstile({
  onToken,
  onStateChange,
  resetSignal = 0,
}: InvisibleTurnstileProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const lastResetSignalRef = useRef(resetSignal);
  const loadTimeoutRef = useRef<ReturnType<
    typeof globalThis.setTimeout
  > | null>(null);
  const widgetDomId = useId();
  const [interactiveChallengeVisible, setInteractiveChallengeVisible] =
    useState(false);
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const shouldBypass = isTurnstileClientBypassed();

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current === null) return;
    globalThis.clearTimeout(loadTimeoutRef.current);
    loadTimeoutRef.current = null;
  }, []);

  const commitState = useCallback(
    (state: InvisibleTurnstileState) => {
      if (state.status !== 'loading') clearLoadTimeout();
      onStateChange?.(state);
    },
    [clearLoadTimeout, onStateChange]
  );

  const beginLoading = useCallback(() => {
    commitState({ status: 'loading' });
    clearLoadTimeout();
    loadTimeoutRef.current = globalThis.setTimeout(() => {
      loadTimeoutRef.current = null;
      setInteractiveChallengeVisible(false);
      onToken('');
      commitState({
        status: 'timeout',
        message: 'Security check timed out. Refresh and try again.',
      });
    }, TURNSTILE_LOAD_TIMEOUT_MS);
  }, [clearLoadTimeout, commitState, onToken]);

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
        callback: token => {
          setInteractiveChallengeVisible(false);
          onToken(token);
          commitState({ status: 'verified' });
        },
        'expired-callback': () => {
          setInteractiveChallengeVisible(false);
          onToken('');
          commitState({
            status: 'expired',
            message: 'Security check expired. Refresh and try again.',
          });
        },
        'error-callback': () => {
          setInteractiveChallengeVisible(false);
          onToken('');
          commitState({
            status: 'error',
            message: 'Security check unavailable. Refresh and try again.',
          });
        },
        'timeout-callback': () => {
          setInteractiveChallengeVisible(false);
          onToken('');
          commitState({
            status: 'timeout',
            message: 'Security check timed out. Refresh and try again.',
          });
        },
        'unsupported-callback': () => {
          setInteractiveChallengeVisible(false);
          onToken('');
          commitState({
            status: 'unsupported',
            message: 'Security check unsupported. Try another browser.',
          });
        },
        'before-interactive-callback': () => {
          setInteractiveChallengeVisible(true);
          commitState({ status: 'interactive' });
        },
        'after-interactive-callback': () => {
          setInteractiveChallengeVisible(false);
          beginLoading();
        },
      });
    } catch {
      setInteractiveChallengeVisible(false);
      onToken('');
      commitState({
        status: 'error',
        message: 'Security check unavailable. Refresh and try again.',
      });
    }
  }, [beginLoading, commitState, onToken, shouldBypass, siteKey]);

  const resetWidget = useCallback(() => {
    clearWidget();
    onToken('');
    beginLoading();
    render();
  }, [beginLoading, clearWidget, onToken, render]);

  useEffect(() => {
    if (shouldBypass) {
      onToken(LOCAL_DEV_BYPASS_TOKEN);
      commitState({ status: 'bypassed' });
      return;
    }
    if (!siteKey) {
      commitState({
        status: 'unconfigured',
        message: 'Subscription is temporarily unavailable.',
      });
      return;
    }

    beginLoading();

    const turnstile = getTurnstile();
    if (turnstile) {
      render();
    }

    return () => {
      clearWidget();
      clearLoadTimeout();
    };
  }, [
    beginLoading,
    clearLoadTimeout,
    clearWidget,
    commitState,
    onToken,
    render,
    shouldBypass,
    siteKey,
  ]);

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
        onLoad={() => {
          if (!getTurnstile()) {
            setInteractiveChallengeVisible(false);
            onToken('');
            commitState({
              status: 'error',
              message: 'Security check unavailable. Refresh and try again.',
            });
            return;
          }
          render();
        }}
        onError={() => {
          setInteractiveChallengeVisible(false);
          onToken('');
          commitState({
            status: 'error',
            message: 'Security check unavailable. Refresh and try again.',
          });
        }}
      />
      <section
        ref={containerRef}
        id={`cf-turnstile-${widgetDomId}`}
        className={
          interactiveChallengeVisible
            ? 'fixed top-1/2 left-1/2 z-50 h-[154px] w-[164px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-lg border border-subtle bg-surface-0 p-1.5 shadow-lg'
            : 'pointer-events-none fixed top-0 -left-full -z-10 h-16 w-80 overflow-hidden opacity-0'
        }
        aria-hidden={interactiveChallengeVisible ? undefined : 'true'}
        aria-label='Security Verification'
        data-turnstile-mount={interactiveChallengeVisible ? 'inline' : 'silent'}
        data-testid='invisible-turnstile-widget'
      />
    </>
  );
}
