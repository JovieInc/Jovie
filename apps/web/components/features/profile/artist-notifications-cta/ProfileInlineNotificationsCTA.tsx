'use client';

import { ArrowRight, Bell, CheckCircle2 } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { OtpInput } from '@/features/auth/atoms/otp-input';
import { useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import {
  useUpdateSubscriberBirthdayMutation,
  useUpdateSubscriberNameMutation,
} from '@/lib/queries';
import type { Artist } from '@/types/db';
import {
  noFontSynthesisStyle,
  SubscriptionFormSkeleton,
  SubscriptionPearlComposer,
  subscriptionComposerFocusClassName,
  subscriptionInputClassName,
  subscriptionPrimaryActionClassName,
} from './shared';
import { useSubscriptionForm } from './useSubscriptionForm';

type Step = 'cta' | 'email' | 'otp' | 'name' | 'birthday' | 'done';

const EASE_FADE: [number, number, number, number] = [0.32, 0, 0.67, 1];

function getExitVariant(instant: boolean) {
  if (instant) return { opacity: 0 };
  return {
    opacity: 0,
    y: -4,
    transition: { duration: 0.16, ease: EASE_FADE },
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
            opacity: { duration: 0.18, ease: EASE_FADE, delay: 0.03 },
            y: { duration: 0.18, ease: EASE_FADE, delay: 0.03 },
          },
        },
  };
}

const circularButtonClassName = `${subscriptionPrimaryActionClassName} !w-10 !h-10 !px-0 !py-0`;

function CircularSubmitButton({
  onClick,
  disabled,
  submitting = false,
}: {
  readonly onClick: () => void;
  readonly disabled: boolean;
  readonly submitting?: boolean;
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={`${circularButtonClassName} relative`}
      aria-label={submitting ? 'Submitting' : 'Submit'}
    >
      {/* Arrow icon — fades out when submitting */}
      <span
        className={`transition-opacity duration-200 ${submitting ? 'opacity-0' : 'opacity-100'}`}
      >
        <ArrowRight className='h-4 w-4' />
      </span>
      {/* Spinner — fades in when submitting */}
      <span
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${submitting ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent' />
      </span>
    </button>
  );
}

/**
 * Format birthday input as MM/DD while typing.
 * Accepts only digits and auto-inserts the slash.
 */
function formatBirthdayInput(raw: string): string {
  const digits = raw.replaceAll(/[^\d]/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

/** Convert "MM/DD" display format to "MM-DD" storage format */
function birthdayDisplayToStorage(display: string): string {
  return display.replace('/', '-');
}

function isDrawerElement(element: Element | null): boolean {
  return element?.closest('[data-testid="profile-menu-drawer"]') !== null;
}

interface InlineInputStepProps {
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly inputId: string;
  readonly testId: string;
  readonly label: string;
  readonly type?: string;
  readonly inputMode?: 'text' | 'email' | 'numeric';
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onSubmit: () => void;
  readonly onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly disabled: boolean;
  readonly submitting?: boolean;
  readonly isFocused: boolean;
  readonly autoComplete?: string;
  readonly maxLength?: number;
}

function InlineInputStep({
  inputRef,
  inputId,
  testId,
  label,
  type = 'text',
  inputMode = 'text',
  placeholder,
  value,
  onChange,
  onSubmit,
  onKeyDown,
  onFocus,
  onBlur,
  disabled,
  submitting = false,
  isFocused,
  autoComplete,
  maxLength,
}: InlineInputStepProps) {
  return (
    <SubscriptionPearlComposer
      dataTestId={`${testId}-composer`}
      className={isFocused ? subscriptionComposerFocusClassName : ''}
      action={
        <CircularSubmitButton
          onClick={onSubmit}
          disabled={disabled}
          submitting={submitting}
        />
      }
    >
      <div
        className={`min-w-0 transition-opacity duration-200 ${submitting ? 'opacity-0' : 'opacity-100'}`}
      >
        <label htmlFor={inputId} className='sr-only'>
          {label}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          data-testid={testId}
          type={type}
          inputMode={inputMode}
          className={subscriptionInputClassName}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          autoComplete={autoComplete}
          maxLength={maxLength}
          style={noFontSynthesisStyle}
        />
      </div>
    </SubscriptionPearlComposer>
  );
}

interface ProfileInlineNotificationsCTAProps {
  readonly artist: Artist;
  readonly onManageNotifications?: () => void;
  /** Register the reveal function so external callers can trigger the email input */
  readonly onRegisterReveal?: (reveal: () => void) => void;
}

export function ProfileInlineNotificationsCTA({
  artist,
  onManageNotifications,
  onRegisterReveal,
}: ProfileInlineNotificationsCTAProps) {
  const {
    emailInput,
    error,
    otpCode,
    isSubmitting,
    handleChannelChange,
    handleEmailChange,
    handleFieldBlur,
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
    notificationsState,
    notificationsEnabled,
    openSubscription,
    hydrationStatus,
    subscribedChannels,
  } = useSubscriptionForm({ artist });

  const [step, setStep] = useState<Step>('cta');
  const [nameInput, setNameInput] = useState('');
  const [birthdayInput, setBirthdayInput] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const prefersReducedMotion = useReducedMotion();
  const { user } = useUserSafe();
  const lastInteractionWasKeyboardRef = useRef(false);
  const suppressNextFocusOpenRef = useRef(false);

  const nameMutation = useUpdateSubscriberNameMutation();
  const birthdayMutation = useUpdateSubscriberBirthdayMutation();

  // Track the email that was used to subscribe (needed for name/birthday updates)
  const subscribedEmailRef = useRef<string>('');

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isAlreadySubscribed =
    notificationsState === 'success' && hasSubscriptions;

  // Sync step with subscription state
  useEffect(() => {
    if (isAlreadySubscribed) {
      if (step === 'cta') {
        setStep('done');
      }
      return;
    }
    // Reset to CTA when unsubscribed (e.g. via ellipsis menu)
    if (step === 'done') {
      setStep('cta');
    }
  }, [isAlreadySubscribed, step]);

  // Watch for pending confirmation to advance from email → otp
  useEffect(() => {
    if (step === 'email' && notificationsState === 'pending_confirmation') {
      setStep('otp');
    }
  }, [step, notificationsState]);

  // Watch for subscription success to advance from email/otp → name
  useEffect(() => {
    if (
      (step === 'email' || step === 'otp') &&
      notificationsState === 'success'
    ) {
      subscribedEmailRef.current = emailInput.trim();
      setStep('name');
    }
  }, [step, notificationsState, emailInput]);

  // Auto-focus input on step transitions
  useEffect(() => {
    if (step === 'cta' || step === 'done') return;
    const timeoutId = globalThis.setTimeout(
      () => inputRef.current?.focus({ preventScroll: true }),
      prefersReducedMotion ? 0 : 350
    );
    return () => globalThis.clearTimeout(timeoutId);
  }, [step, prefersReducedMotion]);

  // Auto-prefill email from Clerk
  useEffect(() => {
    if (step !== 'email' || emailInput) return;
    const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? '';
    if (primaryEmail) handleEmailChange(primaryEmail);
  }, [step, emailInput, user, handleEmailChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      lastInteractionWasKeyboardRef.current = event.key === 'Tab';
    };
    const handlePointerIntent = () => {
      lastInteractionWasKeyboardRef.current = false;
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    globalThis.addEventListener('pointerdown', handlePointerIntent);

    return () => {
      globalThis.removeEventListener('keydown', handleKeyDown);
      globalThis.removeEventListener('pointerdown', handlePointerIntent);
    };
  }, []);

  const handleReveal = useCallback(() => {
    openSubscription();
    handleChannelChange('email'); // Inline CTA always uses email
    setStep('email');
    track('subscribe_step_reveal', {
      handle: artist.handle,
      source: 'profile_inline_cta',
    });
  }, [artist.handle, openSubscription, handleChannelChange]);

  const handleManageNotifications = useCallback(() => {
    if (!onManageNotifications) return;

    suppressNextFocusOpenRef.current = true;
    onManageNotifications();
  }, [onManageNotifications]);

  // Expose the reveal function to external callers (e.g. menu "Get Notified")
  useEffect(() => {
    onRegisterReveal?.(handleReveal);
  }, [onRegisterReveal, handleReveal]);

  const handleEmailSubmit = useCallback(() => {
    handleSubscribe().catch(() => {});
  }, [handleSubscribe]);

  const handleNameSubmit = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setStep('birthday');
      return;
    }
    try {
      await nameMutation.mutateAsync({
        artistId: artist.id,
        email: subscribedEmailRef.current,
        name: trimmed,
      });
      track('name_capture_submitted', {
        handle: artist.handle,
        source: 'profile_inline_cta',
      });
    } catch {
      // Best-effort — don't block the flow
    }
    setStep('birthday');
  }, [nameInput, artist.id, artist.handle, nameMutation]);

  const handleBirthdaySubmit = useCallback(async () => {
    const digits = birthdayInput.replaceAll(/[^\d]/g, '');
    if (digits.length < 4) {
      setStep('done');
      return;
    }
    const stored = birthdayDisplayToStorage(formatBirthdayInput(digits));
    try {
      await birthdayMutation.mutateAsync({
        artistId: artist.id,
        email: subscribedEmailRef.current,
        birthday: stored,
      });
      track('birthday_capture_submitted', {
        handle: artist.handle,
        source: 'profile_inline_cta',
      });
    } catch {
      // Best-effort — don't block the flow
    }
    setStep('done');
  }, [birthdayInput, artist.id, artist.handle, birthdayMutation]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (step === 'email') handleEmailSubmit();
      else if (step === 'name') handleNameSubmit().catch(() => {});
      else if (step === 'birthday') handleBirthdaySubmit().catch(() => {});
    },
    [step, handleEmailSubmit, handleNameSubmit, handleBirthdaySubmit]
  );

  const handleManageButtonFocus = useCallback(() => {
    if (!lastInteractionWasKeyboardRef.current) return;
    if (suppressNextFocusOpenRef.current) return;

    handleManageNotifications();
  }, [handleManageNotifications]);

  const handleManageButtonBlur = useCallback(
    (event: React.FocusEvent<HTMLButtonElement>) => {
      if (isDrawerElement(event.relatedTarget as Element | null)) {
        return;
      }

      suppressNextFocusOpenRef.current = false;
    },
    []
  );

  const handleManageButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      event.preventDefault();
      handleManageNotifications();
    },
    [handleManageNotifications]
  );

  if (hydrationStatus === 'checking') {
    return <SubscriptionFormSkeleton />;
  }

  if (!notificationsEnabled) {
    return null;
  }

  const instant = prefersReducedMotion === true;
  const enterVariant = getEnterVariant(instant);

  return (
    <div data-testid='profile-inline-cta'>
      <AnimatePresence mode='wait' initial={false}>
        {step === 'cta' && (
          <motion.div key='inline-cta' exit={getExitVariant(instant)}>
            <button
              type='button'
              onClick={handleReveal}
              className={`${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`}
              style={noFontSynthesisStyle}
            >
              <Bell className='h-4 w-4' />
              Turn on notifications
            </button>
          </motion.div>
        )}

        {step === 'email' && (
          <motion.div
            key='inline-email'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
            exit={getExitVariant(instant)}
          >
            <InlineInputStep
              inputRef={inputRef}
              inputId={`${inputId}-email`}
              testId='inline-email-input'
              label='Email address'
              type='email'
              inputMode='email'
              placeholder='your@email.com'
              value={emailInput}
              onChange={e => handleEmailChange(e.target.value)}
              onSubmit={handleEmailSubmit}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => {
                setIsInputFocused(false);
                handleFieldBlur();
              }}
              disabled={isSubmitting}
              submitting={isSubmitting}
              isFocused={isInputFocused}
              autoComplete='email'
              maxLength={254}
            />
            {error && (
              <p className='mt-2 text-center text-[12px] text-red-400'>
                {error}
              </p>
            )}
          </motion.div>
        )}

        {step === 'otp' && (
          <motion.div
            key='inline-otp'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
            exit={getExitVariant(instant)}
          >
            <SubscriptionPearlComposer
              dataTestId='inline-otp-composer'
              layout='stacked'
              className='px-3 py-3'
              action={
                <CircularSubmitButton
                  onClick={() => {
                    handleVerifyOtp().catch(() => {});
                  }}
                  disabled={otpCode.length !== 6 || isSubmitting}
                  submitting={isSubmitting}
                />
              }
            >
              <div className='px-2 py-2'>
                <OtpInput
                  value={otpCode}
                  onChange={handleOtpChange}
                  onComplete={() => {
                    handleVerifyOtp().catch(() => {});
                  }}
                  autoFocus
                  aria-label='Enter 6-digit verification code'
                  disabled={isSubmitting}
                  error={Boolean(error)}
                />
              </div>
            </SubscriptionPearlComposer>
            {error && (
              <p className='mt-2 text-center text-[12px] text-red-400'>
                {error}
              </p>
            )}
          </motion.div>
        )}

        {step === 'name' && (
          <motion.div
            key='inline-name'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
            exit={getExitVariant(instant)}
          >
            <InlineInputStep
              inputRef={inputRef}
              inputId={`${inputId}-name`}
              testId='inline-name-input'
              label='First name'
              placeholder="What's your name?"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onSubmit={() => {
                handleNameSubmit().catch(console.error);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              disabled={nameMutation.isPending}
              isFocused={isInputFocused}
              autoComplete='given-name'
              maxLength={100}
            />
          </motion.div>
        )}

        {step === 'birthday' && (
          <motion.div
            key='inline-birthday'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
            exit={getExitVariant(instant)}
          >
            <InlineInputStep
              inputRef={inputRef}
              inputId={`${inputId}-birthday`}
              testId='inline-birthday-input'
              label='Birthday'
              inputMode='numeric'
              placeholder='Birthday (MM/DD)'
              value={birthdayInput}
              onChange={e =>
                setBirthdayInput(formatBirthdayInput(e.target.value))
              }
              onSubmit={() => {
                handleBirthdaySubmit().catch(console.error);
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              disabled={birthdayMutation.isPending}
              isFocused={isInputFocused}
              autoComplete='bday'
              maxLength={5}
            />
          </motion.div>
        )}

        {step === 'done' && (
          <motion.div
            key='inline-done'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
          >
            <button
              type='button'
              data-testid='inline-notifications-on-button'
              onClick={handleManageNotifications}
              onFocus={handleManageButtonFocus}
              onBlur={handleManageButtonBlur}
              onKeyDown={handleManageButtonKeyDown}
              className={`${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`}
              style={noFontSynthesisStyle}
              aria-label='Manage notifications'
              aria-haspopup='dialog'
            >
              <CheckCircle2
                className='h-4 w-4 shrink-0 text-green-400'
                aria-hidden='true'
              />
              <span className='text-[14px] font-[560] tracking-[-0.015em] text-white/88'>
                Notifications on
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
