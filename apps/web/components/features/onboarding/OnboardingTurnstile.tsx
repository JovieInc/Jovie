'use client';

import { Skeleton } from '@jovie/ui';
import { useReducedMotion } from 'motion/react';
import Script from 'next/script';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { publicEnv } from '@/lib/env-public';
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

function getTurnstile() {
  return globalThis.window.turnstile;
}

/**
 * Whether the chat should reserve inline space for the widget. True only when
 * Cloudflare is running a genuine interactive challenge — every other state is
 * either silent (no UI) or routed to the compact toast in OnboardingShell.
 */
export function isOnboardingTurnstilePanelVisible(
  state: OnboardingTurnstileState,
  _instruction?: string | null,
  _siteKey?: string | null
): boolean {
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
  const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const hasStaticBypass =
    process.env.NODE_ENV === 'development' ||
    publicEnv.NEXT_PUBLIC_E2E_MODE === '1' ||
    publicEnv.NEXT_PUBLIC_CLERK_MOCK === '1';
  const shouldBypassTurnstile =
    hasStaticBypass || localAutomationBypass === true;
  const isRuntimeBypassPending =
    !hasStaticBypass && localAutomationBypass === null;
  // `reducedMotion` / `instruction` / `focusSignal` are kept in the prop and
  // hook surface for API stability with the shell but no longer drive any
  // celebration motion or scroll-into-view of a panel that no longer exists.
  void reducedMotion;
  void instruction;
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

  // Only a genuine interactive challenge reserves visible space. Everything
  // else (loading, silent verify, hard failure, expiry) renders an off-screen
  // widget so the token machinery keeps working without any visible chrome.
  const showInteractiveWidget =
    Boolean(siteKey) && state.status === 'interactive';
  const showWidgetContent = interactiveChallengeVisible;

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
              : 'sr-only h-0 overflow-hidden'
          )}
          data-testid='onboarding-turnstile-widget-frame'
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
