'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { AlertCircle, Bell } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import type { Artist } from '@/types/db';
import {
  noFontSynthesisStyle,
  SubscriptionFormSkeleton,
  SubscriptionPendingConfirmation,
  SubscriptionSuccess,
} from './shared';
import { useSubscriptionForm } from './useSubscriptionForm';

type Step = 'button' | 'input';

const EASE_FADE: [number, number, number, number] = [0.32, 0, 0.67, 1];

function getExitVariant(instant: boolean) {
  if (instant) return { opacity: 0 };
  return {
    opacity: 0,
    y: -8,
    transition: { duration: 0.2, ease: EASE_FADE },
  };
}

function getEnterVariant(instant: boolean) {
  return {
    initial: instant ? false : ({ opacity: 0, y: 8 } as const),
    animate: instant
      ? { opacity: 1, y: 0 }
      : {
          opacity: 1,
          y: 0,
          transition: {
            opacity: { duration: 0.25, ease: EASE_FADE, delay: 0.05 },
            y: {
              type: 'spring' as const,
              stiffness: 500,
              damping: 30,
              delay: 0.05,
            },
          },
        },
  };
}

interface TwoStepNotificationsCTAProps {
  readonly artist: Artist;
}

function useImpressionTracking(handle: string) {
  const [tracked, setTracked] = useState(false);
  useEffect(() => {
    setTracked(false);
  }, [handle]);
  useEffect(() => {
    if (tracked) return;
    track('subscribe_impression', {
      handle,
      placement: 'profile_inline',
      variant: 'two_step',
    });
    setTracked(true);
  }, [tracked, handle]);
}

export function TwoStepNotificationsCTA({
  artist,
}: TwoStepNotificationsCTAProps) {
  const {
    emailInput,
    error,
    isSubmitting,
    handleEmailChange,
    handleFieldBlur,
    handleSubscribe,
    handleKeyDown,
    notificationsState,
    notificationsEnabled,
    subscribedChannels,
    openSubscription,
    hydrationStatus,
  } = useSubscriptionForm({ artist });

  const [step, setStep] = useState<Step>('button');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const disclaimerId = useId();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useImpressionTracking(artist.handle);

  const handleReveal = useCallback(() => {
    openSubscription();
    setStep('input');
    track('subscribe_step_reveal', {
      handle: artist.handle,
      source: 'profile_inline',
    });
  }, [artist.handle, openSubscription]);

  // Auto-focus the email input after transition to step 2
  useEffect(() => {
    if (step !== 'input') return;
    const timeoutId = window.setTimeout(
      () => {
        inputRef.current?.focus({ preventScroll: true });
      },
      prefersReducedMotion ? 0 : 350
    );
    return () => window.clearTimeout(timeoutId);
  }, [step, prefersReducedMotion]);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;

  if (hydrationStatus === 'checking') {
    return <SubscriptionFormSkeleton />;
  }

  if (notificationsState === 'pending_confirmation') {
    return <SubscriptionPendingConfirmation />;
  }

  if (isSubscribed) {
    return <SubscriptionSuccess artistName={artist.name} />;
  }

  // If notifications aren't enabled, don't render (parent handles fallback)
  if (!notificationsEnabled) {
    return null;
  }

  const instant = prefersReducedMotion === true;
  const enterVariant = getEnterVariant(instant);

  return (
    <div className='space-y-3'>
      <AnimatePresence mode='wait' initial={false}>
        {step === 'button' ? (
          <motion.div key='cta-button' exit={getExitVariant(instant)}>
            <button
              type='button'
              onClick={handleReveal}
              className='w-full inline-flex items-center justify-center gap-2.5 rounded-xl bg-btn-primary px-8 py-4 text-base font-semibold text-btn-primary-foreground shadow-sm transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
              style={noFontSynthesisStyle}
            >
              <Bell className='w-5 h-5' aria-hidden='true' />
              Turn on Notifications
            </button>
          </motion.div>
        ) : (
          <motion.div
            key='cta-input'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
          >
            <div className='space-y-3'>
              <p
                className='text-center text-[13px] font-[450] tracking-wide text-tertiary-token'
                style={noFontSynthesisStyle}
              >
                Get notified about new releases &amp; more.
              </p>

              <div className='rounded-2xl bg-surface-0 backdrop-blur-md ring-1 ring-(--color-border-subtle) shadow-sm focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))] transition-[box-shadow,ring] overflow-hidden'>
                <div className='flex items-center'>
                  <div className='h-12 pl-4 pr-3 flex items-center text-tertiary-token'>
                    <Bell className='w-4 h-4' aria-hidden='true' />
                  </div>
                  <div className='flex-1 min-w-0'>
                    <label htmlFor={inputId} className='sr-only'>
                      Email address
                    </label>
                    <input
                      ref={inputRef}
                      id={inputId}
                      aria-describedby={disclaimerId}
                      type='email'
                      inputMode='email'
                      className='w-full h-12 px-4 bg-transparent text-[15px] text-primary-token placeholder:text-tertiary-token placeholder:opacity-80 border-none focus-visible:outline-none focus-visible:ring-0'
                      placeholder='your@email.com'
                      value={emailInput}
                      onChange={event => handleEmailChange(event.target.value)}
                      onFocus={() => setIsInputFocused(true)}
                      onBlur={() => {
                        setIsInputFocused(false);
                        handleFieldBlur();
                      }}
                      onKeyDown={handleKeyDown}
                      disabled={isSubmitting}
                      autoComplete='email'
                      maxLength={254}
                      style={noFontSynthesisStyle}
                    />
                  </div>
                </div>
              </div>

              <button
                type='button'
                onClick={() => void handleSubscribe()}
                disabled={isSubmitting}
                className='w-full h-11 inline-flex items-center justify-center rounded-md bg-btn-primary text-btn-primary-foreground text-base font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus-ring-themed focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
                style={noFontSynthesisStyle}
              >
                {isSubmitting ? 'Subscribing…' : 'Get Notified'}
              </button>

              <div className='flex items-center justify-center gap-2'>
                <p
                  id={disclaimerId}
                  className={`text-center text-[11px] leading-4 font-normal tracking-wide text-muted-foreground/80 transition-opacity duration-200 ${
                    isInputFocused && !error ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={noFontSynthesisStyle}
                  aria-hidden={!isInputFocused || Boolean(error)}
                >
                  No spam. Opt-out anytime.
                </p>

                {error && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip defaultOpen>
                      <TooltipTrigger>
                        <span
                          className='inline-flex items-center gap-1.5 text-sm text-red-500 dark:text-red-400'
                          role='alert'
                          aria-live='assertive'
                        >
                          <AlertCircle className='h-4 w-4' aria-hidden='true' />
                          <span className='sr-only'>{error}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent
                        side='bottom'
                        className='max-w-[280px] border-red-500/20 bg-red-950/90 text-red-200'
                      >
                        {error}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
