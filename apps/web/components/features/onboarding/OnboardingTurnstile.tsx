'use client';

import { Skeleton } from '@jovie/ui';
import { useReducedMotion } from 'motion/react';
import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { publicEnv } from '@/lib/env-public';
import {
  getBrowserTurnstileHostname,
  resolveTurnstileSiteKey,
} from '@/lib/turnstile/keys';
import { cn } from '@/lib/utils';
import { isOnboardingLocalAutomationBypassRuntime } from './onboardingAutomationBypass';

/**
 * Cloudflare Turnstile widget for the onboarding chat.
 *
 * Mounts a fully invisible (`appearance: 'execute'`) Turnstile widget. On the
 * happy path it renders NOTHING the user can see — the token is minted silently
 * and handed back via `onToken`, then consumed by the chat client on the first
 * `/api/chat` POST. Subsequent messages rely on the signed session cookie and do
 * not re-verify.
 *
 * The visible "Security Check" panel, the headings, the "Verified" celebration
 * beat, and the misconfig wall were removed (JOV-3563). The only thing this
 * component ever shows is the bare Cloudflare widget itself, and ONLY when
 * Cloudflare genuinely requires interaction. Hard failures (error / timeout /
 * unsupported / unconfigured) and expiry surface through `onStateChange`, which
 * `OnboardingShell` routes to a single compact toast — never an inline card.
 * Expiry/timeout silently re-issue so an in-progress chat is never re-walled.
 *
 * In local development / E2E the widget short-circuits and the chat handler's
 * dev-mode skip owns trust.
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
const DEFAULT_STATE: OnboardingTurnstileState = { status: 'loading' };
/** How long execute-mode can stay token-less before we retry the widget. */
export const ONBOARDING_TURNSTILE_LOADING_STALL_MS = 10_000;
/** Retries before surfacing a hard failure toast in OnboardingShell. */
export const ONBOARDING_TURNSTILE_MAX_LOADING_STALL_RETRIES = 2;

function getTurnstile() {
  return globalThis.window.turnstile;
}

/**
 * Whether the chat should reserve inline space for the widget. True when
 * Cloudflare needs interaction or the user already tried to send while the
 * silent execute pass is still warming up.
 */
export function isOnboardingTurnstilePanelVisible(
  state: OnboardingTurnstileState,
  instruction?: string | null,
  _siteKey?: string | null
): boolean {
  if (instruction && state.status === 'loading') return true;
  return state.status === 'interactive';
}

export function OnboardingTurnstile({
  onToken,
  onStateChange,
  instruction,
  focusSignal = 0,
  resetSignal = 0,
}: OnboardingTurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const lastResetSignalRef = useRef(resetSignal);
  const loadingStallRetryCountRef = useRef(0);
  const lastInstructionNudgeRef = useRef<string | null>(null);
  const widgetDomId = useId();
  const reducedMotion = useReducedMotion();
  const [state, setState] = useState<OnboardingTurnstileState>(DEFAULT_STATE);
  const [localAutomationBypass, setLocalAutomationBypass] = useState<
    boolean | null
  >(null);
  const [interactiveChallengeRequested, setInteractiveChallengeRequested] =
    useState(false);
  const [interactiveChallengeVisible, setInteractiveChallengeVisible] =
    useState(false);
  // Hostname-aware: preview/localhost get always-pass dummy keys so prod
  // domain-locked sitekeys cannot cause Cloudflare 110200 on *.vercel.app.
  const siteKey = resolveTurnstileSiteKey(
    getBrowserTurnstileHostname(),
    publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  );
  const hasStaticBypass =
    process.env.NODE_ENV === 'development' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1';
  const shouldBypassTurnstile =
    hasStaticBypass || localAutomationBypass === true;
  const isRuntimeBypassPending =
    !hasStaticBypass && localAutomationBypass === null;
  const awaitingSendVerification =
    Boolean(instruction) && state.status === 'loading';
  void reducedMotion;
  void focusSignal;

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
    if (isRuntimeBypassPending || shouldBypassTurnstile || !siteKey) return;
    const turnstile = getTurnstile();
    if (!containerRef.current || !turnstile) return;
    if (widgetIdRef.current) return; // already rendered
    try {
      commitState(DEFAULT_STATE);
      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        appearance: 'execute',
        size: 'flexible',
        theme: 'dark',
        callback: token => {
          onToken(token);
          setInteractiveChallengeRequested(false);
          setInteractiveChallengeVisible(false);
          commitState({ status: 'verified' });
        },
        'error-callback': code => {
          setInteractiveChallengeRequested(false);
          setInteractiveChallengeVisible(false);
          commitState({
            status: 'error',
            message: `Verification failed (${code}). Refresh the page to try again.`,
          });
        },
        'expired-callback': () => {
          setInteractiveChallengeRequested(false);
          setInteractiveChallengeVisible(false);
          commitState({ status: 'expired' });
        },
        'timeout-callback': () => {
          setInteractiveChallengeRequested(false);
          setInteractiveChallengeVisible(false);
          commitState({ status: 'timeout' });
        },
        'unsupported-callback': () => {
          setInteractiveChallengeRequested(false);
          setInteractiveChallengeVisible(false);
          commitState({
            status: 'unsupported',
            message:
              'This browser cannot complete the security check. Try another browser or disable restrictive extensions.',
          });
        },
        'before-interactive-callback': () => {
          setInteractiveChallengeRequested(true);
          setInteractiveChallengeVisible(false);
          commitState({ status: 'interactive' });
        },
        'after-interactive-callback': () => commitState({ status: 'loading' }),
      });
    } catch (err) {
      commitState({
        status: 'error',
        message: 'Turnstile failed to load. Refresh the page and try again.',
      });
      console.error('[onboarding] turnstile render error', err);
    }
  }, [
    commitState,
    isRuntimeBypassPending,
    onToken,
    shouldBypassTurnstile,
    siteKey,
  ]);

  const resetWidget = useCallback(() => {
    clearWidget();
    setInteractiveChallengeRequested(false);
    setInteractiveChallengeVisible(false);
    commitState({ status: 'loading' });
    render();
  }, [clearWidget, commitState, render]);

  useEffect(() => {
    if (isRuntimeBypassPending) return;
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
  }, [
    commitState,
    isRuntimeBypassPending,
    onToken,
    render,
    shouldBypassTurnstile,
    siteKey,
  ]);

  useEffect(() => {
    if (lastResetSignalRef.current === resetSignal) return;
    lastResetSignalRef.current = resetSignal;
    resetWidget();
  }, [resetSignal, resetWidget]);

  useEffect(() => {
    if (!instruction || shouldBypassTurnstile || isRuntimeBypassPending) return;
    if (state.status !== 'loading') return;
    if (lastInstructionNudgeRef.current === instruction) return;
    lastInstructionNudgeRef.current = instruction;
    resetWidget();
  }, [
    instruction,
    isRuntimeBypassPending,
    resetWidget,
    shouldBypassTurnstile,
    state.status,
  ]);

  useEffect(() => {
    if (shouldBypassTurnstile || isRuntimeBypassPending || !siteKey) return;
    if (state.status !== 'loading') {
      loadingStallRetryCountRef.current = 0;
      return;
    }

    const timer = globalThis.setTimeout(() => {
      if (
        loadingStallRetryCountRef.current <
        ONBOARDING_TURNSTILE_MAX_LOADING_STALL_RETRIES
      ) {
        loadingStallRetryCountRef.current += 1;
        resetWidget();
        return;
      }

      commitState({
        status: 'error',
        message:
          'Security check is taking longer than expected. Refresh the page or try another browser.',
      });
    }, ONBOARDING_TURNSTILE_LOADING_STALL_MS);

    return () => globalThis.clearTimeout(timer);
  }, [
    commitState,
    isRuntimeBypassPending,
    resetWidget,
    shouldBypassTurnstile,
    siteKey,
    state.status,
  ]);

  useEffect(() => {
    if (!focusSignal || !containerRef.current) return;
    containerRef.current.scrollIntoView({
      block: 'nearest',
      behavior: reducedMotion ? 'auto' : 'smooth',
    });
  }, [focusSignal, reducedMotion]);

  // Expiry/timeout silently re-issue a token so an in-progress chat is never
  // re-walled with a visible challenge. A fresh execute pass usually resolves
  // silently; only a genuine interactive requirement re-surfaces the widget.
  useEffect(() => {
    if (state.status !== 'expired' && state.status !== 'timeout') return;
    resetWidget();
  }, [state.status, resetWidget]);

  // Reveal the Cloudflare widget only once it has actually painted content,
  // and only for a genuine interactive challenge. Until then it stays
  // visually hidden so no empty box flashes.
  useEffect(() => {
    if (!interactiveChallengeRequested || interactiveChallengeVisible) return;
    const target = containerRef.current;
    if (!target) return;

    let frameId: number | null = null;
    let observer: MutationObserver | null = null;

    const revealAfterPaint = () => {
      if (frameId !== null) return;
      frameId = requestAnimationFrame(() => {
        setInteractiveChallengeVisible(true);
      });
    };

    if (target.firstElementChild) {
      revealAfterPaint();
    } else {
      observer = new MutationObserver(() => {
        if (target.firstElementChild) {
          observer?.disconnect();
          observer = null;
          revealAfterPaint();
        }
      });
      observer.observe(target, { childList: true });
    }

    return () => {
      observer?.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [interactiveChallengeRequested, interactiveChallengeVisible]);

  if (isRuntimeBypassPending || shouldBypassTurnstile) {
    // No Turnstile UI in dev. The server-side dev-mode skip still owns trust.
    return null;
  }

  // Interactive challenges and send-while-loading both reserve inline space.
  // The silent happy path keeps a sized off-screen mount so execute mode can
  // actually run (zero-height containers can stall token minting in prod).
  const showInteractiveWidget =
    Boolean(siteKey) &&
    (state.status === 'interactive' || awaitingSendVerification);
  const showWidgetContent =
    interactiveChallengeVisible || awaitingSendVerification;

  return (
    <>
      {siteKey ? (
        <Script
          src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
          strategy='afterInteractive'
          onLoad={() => render()}
        />
      ) : null}
      {siteKey ? (
        <div
          className={cn(
            showInteractiveWidget
              ? 'relative mt-2 overflow-hidden rounded-lg border border-subtle bg-surface-0 p-1.5'
              : 'pointer-events-none fixed top-0 -left-full -z-10 h-16 w-80 overflow-hidden opacity-0'
          )}
          data-testid='onboarding-turnstile-widget-frame'
          data-turnstile-mount={showInteractiveWidget ? 'inline' : 'silent'}
          data-turnstile-status={state.status}
          aria-hidden={showInteractiveWidget ? undefined : 'true'}
        >
          {showInteractiveWidget && !showWidgetContent ? (
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
            className={cn(
              'relative min-h-16',
              showWidgetContent ? '[&>div]:visible' : '[&>div]:invisible'
            )}
          />
        </div>
      ) : null}
    </>
  );
}
