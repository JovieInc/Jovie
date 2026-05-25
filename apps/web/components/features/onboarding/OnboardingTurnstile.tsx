'use client';

import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { publicEnv } from '@/lib/env-public';
import { cn } from '@/lib/utils';

/**
 * Cloudflare Turnstile widget for the onboarding chat (JOV-2132 PR 3).
 *
 * Loads the Turnstile script and mounts a Managed widget inside the onboarding
 * composer security panel. The resulting token is passed back via `onToken`,
 * then consumed by the chat client on the first /api/chat POST in
 * `mode='onboarding'`. Subsequent messages within the same session rely on the
 * signed session cookie + the session-lifetime rate limiter and do NOT
 * re-verify.
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
          'timeout-callback'?: () => void;
          'unsupported-callback'?: () => void;
          'before-interactive-callback'?: () => void;
          'after-interactive-callback'?: () => void;
          appearance?: 'always' | 'execute' | 'interaction-only';
          size?: 'normal' | 'flexible' | 'compact';
          theme?: 'auto' | 'light' | 'dark';
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export type OnboardingTurnstileStatus =
  | 'loading'
  | 'interactive'
  | 'verified'
  | 'expired'
  | 'timeout'
  | 'error'
  | 'unsupported'
  | 'bypassed'
  | 'unconfigured';

export interface OnboardingTurnstileState {
  readonly status: OnboardingTurnstileStatus;
  readonly message?: string;
}

interface OnboardingTurnstileProps {
  readonly onToken: (token: string) => void;
  readonly onStateChange: (state: OnboardingTurnstileState) => void;
  readonly instruction?: string | null;
  readonly focusSignal?: number;
  readonly resetSignal?: number;
}

const LOCAL_DEV_BYPASS_TOKEN = 'local-dev-turnstile-bypass';
const DEFAULT_STATE: OnboardingTurnstileState = {
  status: 'loading',
  message: 'Checking your browser before your first message.',
};

function getTurnstile() {
  return globalThis.window.turnstile;
}

function getStateCopy(state: OnboardingTurnstileState) {
  if (state.message) return state.message;
  switch (state.status) {
    case 'interactive':
      return 'Required before your first message.';
    case 'verified':
      return 'Verification complete.';
    case 'expired':
      return 'Verification expired. Complete the check again to send.';
    case 'timeout':
      return 'Verification timed out. Retry the check to send.';
    case 'error':
      return 'Verification failed. Retry the check or refresh the page.';
    case 'unsupported':
      return 'This browser cannot complete the security check. Try another browser or disable restrictive extensions.';
    case 'unconfigured':
      return 'Turnstile is not configured.';
    case 'bypassed':
      return 'Local development verification bypassed.';
    case 'loading':
    default:
      return DEFAULT_STATE.message;
  }
}

function getHeading(status: OnboardingTurnstileStatus) {
  if (status === 'verified' || status === 'bypassed') return 'Verified';
  if (status === 'error' || status === 'timeout' || status === 'expired') {
    return 'Verification Needed';
  }
  if (status === 'unsupported' || status === 'unconfigured') {
    return 'Verification Unavailable';
  }
  return 'Security Check';
}

export function OnboardingTurnstile({
  onToken,
  onStateChange,
  instruction,
  focusSignal = 0,
  resetSignal = 0,
}: OnboardingTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const lastResetSignalRef = useRef(resetSignal);
  const widgetDomId = useId();
  const headingId = useId();
  const [state, setState] = useState<OnboardingTurnstileState>(DEFAULT_STATE);
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const shouldBypassTurnstile = process.env.NODE_ENV === 'development';

  const commitState = useCallback(
    (nextState: OnboardingTurnstileState) => {
      setState(nextState);
      onStateChange(nextState);
    },
    [onStateChange]
  );

  const resetWidget = useCallback(
    (message = 'Verification reset. Complete the check to retry.') => {
      const widgetId = widgetIdRef.current;
      const turnstile = getTurnstile();
      if (widgetId && turnstile) {
        try {
          turnstile.reset(widgetId);
          commitState({ status: 'loading', message });
          return;
        } catch (err) {
          widgetIdRef.current = null;
          console.error('[onboarding] turnstile reset error', err);
        }
      }
      commitState({ status: 'loading', message });
    },
    [commitState]
  );

  const render = useCallback(() => {
    if (shouldBypassTurnstile || !siteKey) return; // local fallback handled server-side
    const turnstile = getTurnstile();
    if (!containerRef.current || !turnstile) return;
    if (widgetIdRef.current) return; // already rendered
    try {
      commitState(DEFAULT_STATE);
      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        appearance: 'interaction-only',
        size: 'flexible',
        theme: 'dark',
        callback: token => {
          onToken(token);
          commitState({ status: 'verified' });
        },
        'error-callback': code =>
          commitState({
            status: 'error',
            message: `Verification failed (${code}). Retry the check or refresh the page.`,
          }),
        'expired-callback': () => {
          commitState({
            status: 'expired',
            message: 'Verification expired. Complete the check again to send.',
          });
          resetWidget(
            'Verification expired. Complete the check again to send.'
          );
        },
        'timeout-callback': () =>
          commitState({
            status: 'timeout',
            message: 'Verification timed out. Retry the check to send.',
          }),
        'unsupported-callback': () =>
          commitState({
            status: 'unsupported',
            message:
              'This browser cannot complete the security check. Try another browser or disable restrictive extensions.',
          }),
        'before-interactive-callback': () =>
          commitState({
            status: 'interactive',
            message: 'Required before your first message.',
          }),
        'after-interactive-callback': () =>
          commitState({
            status: 'loading',
            message: 'Finishing verification...',
          }),
      });
    } catch (err) {
      commitState({
        status: 'error',
        message: 'Turnstile failed to load. Refresh the page and try again.',
      });
      console.error('[onboarding] turnstile render error', err);
    }
  }, [commitState, onToken, resetWidget, shouldBypassTurnstile, siteKey]);

  useEffect(() => {
    if (shouldBypassTurnstile) {
      onToken(LOCAL_DEV_BYPASS_TOKEN);
      commitState({ status: 'bypassed' });
      return;
    }
    if (!siteKey) {
      commitState({
        status: 'unconfigured',
        message: 'Turnstile is not configured.',
      });
      return;
    }
    const turnstile = getTurnstile();
    if (turnstile) {
      render();
    }
    return () => {
      const id = widgetIdRef.current;
      if (id && turnstile) {
        try {
          turnstile.remove(id);
        } catch {
          // ignore — widget already torn down
        }
      }
    };
  }, [commitState, onToken, render, shouldBypassTurnstile, siteKey]);

  useEffect(() => {
    if (lastResetSignalRef.current === resetSignal) return;
    lastResetSignalRef.current = resetSignal;
    resetWidget('Verification reset. Complete the check to retry.');
  }, [resetSignal, resetWidget]);

  useEffect(() => {
    if (focusSignal <= 0) return;
    panelRef.current?.scrollIntoView({ block: 'nearest' });
    panelRef.current?.focus({ preventScroll: true });
  }, [focusSignal]);

  if (shouldBypassTurnstile) {
    // No Turnstile UI in dev. The server-side dev-mode skip still owns trust.
    return null;
  }

  const panelCopy = instruction ?? getStateCopy(state);
  const isActionable =
    state.status === 'error' ||
    state.status === 'expired' ||
    state.status === 'timeout';
  const shouldShowPanel =
    !siteKey ||
    state.status === 'loading' ||
    state.status === 'interactive' ||
    state.status === 'error' ||
    state.status === 'expired' ||
    state.status === 'timeout' ||
    state.status === 'unsupported' ||
    Boolean(instruction);

  return (
    <>
      {siteKey ? (
        <Script
          src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
          strategy='afterInteractive'
          onLoad={() => render()}
        />
      ) : null}
      <section
        ref={panelRef}
        aria-labelledby={headingId}
        tabIndex={-1}
        hidden={!shouldShowPanel}
        data-testid='onboarding-turnstile-panel'
        data-turnstile-status={state.status}
        className={cn(
          'px-3 py-2.5 text-primary-token outline-none sm:px-3.5 sm:py-3',
          'focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
        )}
      >
        <div className='flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between'>
          <div className='min-w-0'>
            <p
              id={headingId}
              className='text-app font-medium leading-5 text-primary-token'
            >
              {getHeading(state.status)}
            </p>
            <p className='mt-0.5 max-w-[34rem] text-2xs leading-5 text-secondary-token sm:text-[12px]'>
              {panelCopy}
            </p>
          </div>
          {isActionable ? (
            <button
              type='button'
              onClick={() => resetWidget()}
              className='h-7 shrink-0 rounded-full border border-subtle px-2.5 text-2xs font-medium text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
            >
              Retry Verification
            </button>
          ) : null}
        </div>
        {siteKey ? (
          <div
            className='mt-2.5 overflow-hidden rounded-[10px] border border-subtle bg-surface-0'
            data-testid='onboarding-turnstile-widget-frame'
          >
            <div
              ref={containerRef}
              id={`cf-turnstile-${widgetDomId}`}
              className='min-h-[64px]'
            />
          </div>
        ) : null}
      </section>
    </>
  );
}
