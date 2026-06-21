'use client';

import { Skeleton } from '@jovie/ui';
import { RotateCcw, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { publicEnv } from '@/lib/env-public';
import { cn } from '@/lib/utils';
import { isOnboardingLocalAutomationBypassRuntime } from './onboardingAutomationBypass';

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

type TurnstileTone = 'neutral' | 'success' | 'warning' | 'muted';

const TONE_BADGE_CLASSES: Record<TurnstileTone, string> = {
  neutral: 'border-subtle bg-surface-0 text-secondary-token',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  muted: 'border-subtle bg-surface-0 text-tertiary-token',
};

function getStatusTone(status: OnboardingTurnstileStatus): TurnstileTone {
  if (status === 'verified' || status === 'bypassed') return 'success';
  if (status === 'error' || status === 'timeout' || status === 'expired') {
    return 'warning';
  }
  if (status === 'unsupported' || status === 'unconfigured') return 'muted';
  return 'neutral';
}

function TurnstileStatusIcon({
  status,
  className,
}: {
  readonly status: OnboardingTurnstileStatus;
  readonly className?: string;
}) {
  switch (getStatusTone(status)) {
    case 'warning':
      return <ShieldAlert className={className} strokeWidth={2} />;
    case 'muted':
      return <ShieldOff className={className} strokeWidth={2} />;
    default:
      return <ShieldCheck className={className} strokeWidth={2} />;
  }
}

/** Hold the "Verified" confirmation briefly before the panel collapses. */
const VERIFIED_MOMENT_MS = 600;

export function isOnboardingTurnstilePanelVisible(
  state: OnboardingTurnstileState,
  instruction?: string | null,
  siteKey?: string | null
): boolean {
  if (instruction) return true;
  if (!siteKey) return true;
  return (
    state.status === 'interactive' ||
    state.status === 'error' ||
    state.status === 'expired' ||
    state.status === 'timeout' ||
    state.status === 'unsupported'
  );
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
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<OnboardingTurnstileState>(DEFAULT_STATE);
  const [localAutomationBypass, setLocalAutomationBypass] = useState(false);
  // True only while the brief "Verified" confirmation is held open after a
  // *visible* challenge. Silent (invisible-first) verifications never set it,
  // so the panel stays collapsed when the user never saw a challenge.
  const [verifiedMoment, setVerifiedMoment] = useState(false);
  const panelVisibleRef = useRef(false);
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const shouldBypassTurnstile =
    process.env.NODE_ENV === 'development' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1' ||
    localAutomationBypass;

  useEffect(() => {
    setLocalAutomationBypass(isOnboardingLocalAutomationBypassRuntime());
  }, []);

  const commitState = useCallback(
    (nextState: OnboardingTurnstileState) => {
      setState(nextState);
      onStateChange(nextState);
    },
    [onStateChange]
  );

  const clearWidget = useCallback(() => {
    const widgetId = widgetIdRef.current;
    const turnstile = getTurnstile();
    if (widgetId && turnstile) {
      try {
        turnstile.remove(widgetId);
      } catch (err) {
        console.error('[onboarding] turnstile remove error', err);
      }
    }
    widgetIdRef.current = null;
    if (containerRef.current) {
      containerRef.current.replaceChildren();
    }
  }, []);

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
          // Only celebrate when the user actually saw a challenge. Silent
          // invisible-first verifications collapse straight away (no UI churn).
          if (panelVisibleRef.current && !reducedMotion) {
            setVerifiedMoment(true);
          }
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
  }, [commitState, onToken, reducedMotion, shouldBypassTurnstile, siteKey]);

  useEffect(() => {
    if (!verifiedMoment) return;
    const timer = setTimeout(
      () => setVerifiedMoment(false),
      VERIFIED_MOMENT_MS
    );
    return () => clearTimeout(timer);
  }, [verifiedMoment]);

  const resetWidget = useCallback(
    (message = 'Verification reset. Complete the check to retry.') => {
      clearWidget();
      setVerifiedMoment(false);
      commitState({ status: 'loading', message });
      render();
    },
    [clearWidget, commitState, render]
  );

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

  const shouldShowPanel =
    isOnboardingTurnstilePanelVisible(state, instruction, siteKey) ||
    verifiedMoment;
  // Track the panel's visibility so the success callback can tell a *visible*
  // challenge (worth a "Verified" beat) from a silent invisible verification.
  // Synced in an effect (never written during render) so the value reflects the
  // last committed render when Cloudflare's async callback fires.
  useEffect(() => {
    panelVisibleRef.current = shouldShowPanel;
  }, [shouldShowPanel]);

  if (shouldBypassTurnstile) {
    // No Turnstile UI in dev. The server-side dev-mode skip still owns trust.
    return null;
  }

  const panelCopy = instruction ?? getStateCopy(state);
  const isActionable =
    state.status === 'error' ||
    state.status === 'expired' ||
    state.status === 'timeout';
  const shouldShowWidgetFrame =
    shouldShowPanel &&
    siteKey &&
    (state.status === 'interactive' ||
      state.status === 'error' ||
      state.status === 'expired' ||
      state.status === 'timeout' ||
      // Keep the frame reserved through the "Verified" beat so the panel
      // collapses in one clean step instead of shrinking twice.
      verifiedMoment ||
      Boolean(instruction));
  const tone = getStatusTone(state.status);

  return (
    <>
      {siteKey ? (
        <Script
          src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
          strategy='afterInteractive'
          onLoad={() => render()}
        />
      ) : null}
      {shouldShowPanel ? (
        <section
          ref={panelRef}
          aria-labelledby={headingId}
          tabIndex={-1}
          data-testid='onboarding-turnstile-panel'
          data-turnstile-status={state.status}
          className={cn(
            'px-3 py-2.5 text-primary-token outline-none sm:px-3.5 sm:py-3',
            'focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
          )}
        >
          <div className='flex items-start gap-2.5'>
            <span
              aria-hidden='true'
              data-testid='onboarding-turnstile-icon'
              data-turnstile-icon={state.status}
              className={cn(
                'mt-px flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors duration-subtle',
                TONE_BADGE_CLASSES[tone]
              )}
            >
              <TurnstileStatusIcon status={state.status} className='size-4' />
            </span>
            <div className='flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between'>
              <div className='min-w-0'>
                <p
                  id={headingId}
                  className='text-app font-medium leading-5 text-primary-token'
                >
                  {getHeading(state.status)}
                </p>
                <p className='mt-0.5 max-w-[34rem] text-2xs leading-5 text-secondary-token sm:text-xs'>
                  {panelCopy}
                </p>
              </div>
              {isActionable ? (
                <button
                  type='button'
                  onClick={() => resetWidget()}
                  className='inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-subtle px-2.5 text-2xs font-medium text-secondary-token transition-[background-color,border-color,color] duration-subtle hover:bg-surface-0 hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--linear-border-focus)/20'
                >
                  <RotateCcw className='size-3.5' aria-hidden='true' />
                  Retry Verification
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {siteKey ? (
        <div
          className={cn(
            shouldShowWidgetFrame
              ? 'relative mt-2 overflow-hidden rounded-lg border border-subtle bg-surface-0 p-1.5'
              : 'sr-only h-0 overflow-hidden',
            !shouldShowPanel && 'sr-only h-0 overflow-hidden'
          )}
          data-testid='onboarding-turnstile-widget-frame'
          aria-hidden={!shouldShowWidgetFrame ? 'true' : undefined}
        >
          {shouldShowWidgetFrame && state.status !== 'verified' ? (
            <Skeleton
              aria-hidden='true'
              data-testid='onboarding-turnstile-widget-skeleton'
              rounded='md'
              className='pointer-events-none absolute inset-1.5'
            />
          ) : null}
          <div
            ref={containerRef}
            id={`cf-turnstile-${widgetDomId}`}
            className='relative min-h-16'
          />
        </div>
      ) : null}
    </>
  );
}
