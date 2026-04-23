'use client';

import { ArrowRight, Bell, CheckCircle2 } from 'lucide-react';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { OtpInput } from '@/features/auth/atoms/otp-input';
import { useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import {
  useUpdateSubscriberBirthdayMutation,
  useUpdateSubscriberNameMutation,
} from '@/lib/queries/useNotificationStatusQuery';
import type { Artist } from '@/types/db';
import {
  clearOtpConfirmTimeout,
  noFontSynthesisStyle,
  profileHeroMorphPillClassName,
  requestOtpResendConfirmation,
  SubscriptionDesktopErrorIndicator,
  SubscriptionFeedbackRail,
  SubscriptionFormSkeleton,
  SubscriptionOtpResendAction,
  SubscriptionPearlComposer,
  subscriptionComposerFocusClassName,
  subscriptionHeroComposerFocusClassName,
  subscriptionHeroInputClassName,
  subscriptionHeroSubmitClassName,
  subscriptionInputClassName,
  subscriptionPrimaryActionClassName,
  subscriptionSuccessTextClassName,
  useSubscriptionErrorFeedback,
} from './shared';
import { useSubscriptionForm } from './useSubscriptionForm';

type Step = 'cta' | 'email' | 'otp' | 'name' | 'birthday' | 'done';
type RevealVisualState = 'collapsed' | 'expanded' | 'submitting' | 'error';

// ─── Composer shell geometry ──────────────────────────────────────────
// The wrapper's fixed height is what makes the step-stack "morph" rather
// than "resize". Every step panel renders absolutely inside this wrapper.
const inlineComposerWrapperClassName = 'h-[72px]'; // default: 48px shell + 20px rail + gap
const heroComposerWrapperClassName = 'h-[64px]'; // hero:    44px shell + 20px rail

// ─── Buttons ──────────────────────────────────────────────────────────
const circularButtonClassName = `${subscriptionPrimaryActionClassName} !h-10 !w-10 !px-0 !py-0`;

// ─── Focus & blur timing ──────────────────────────────────────────────
// The reveal shell's onBlurCapture used to race the input mount/focus
// and collapse the step back to 'cta' before the user ever saw the
// email field. The guard MUST exceed EMAIL_INPUT_FOCUS_DELAY_MS.
const EMAIL_INPUT_FOCUS_DELAY_MS = 180;
const EMAIL_INPUT_FOCUS_DELAY_REDUCED_MS = 0;
const REVEAL_SHELL_BLUR_GUARD_MS = EMAIL_INPUT_FOCUS_DELAY_MS + 70;

function getRevealVisualState(
  step: Step,
  isSubmitting: boolean,
  hasError: boolean
): RevealVisualState {
  if (step === 'cta') return 'collapsed';
  if (isSubmitting) return 'submitting';
  if (hasError) return 'error';
  return 'expanded';
}

function CircularSubmitButton({
  onClick,
  disabled,
  submitting = false,
  tone = 'default',
}: {
  readonly onClick: () => void;
  readonly disabled: boolean;
  readonly submitting?: boolean;
  readonly tone?: 'default' | 'hero';
}) {
  const base =
    tone === 'hero' ? subscriptionHeroSubmitClassName : circularButtonClassName;
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className={`${base} relative`}
      aria-label={submitting ? 'Submitting' : 'Submit'}
    >
      <span
        className={`transition-opacity duration-200 ${submitting ? 'opacity-0' : 'opacity-100'}`}
      >
        <ArrowRight className='h-4 w-4' />
      </span>
      <span
        className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${submitting ? 'opacity-100' : 'opacity-0'}`}
      >
        <span className='h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none' />
      </span>
    </button>
  );
}

function birthdayDigitsToStorage(digits: string): string {
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

function isDrawerElement(element: Element | null): boolean {
  return element?.closest('[data-testid="profile-menu-drawer"]') !== null;
}

interface BirthdayInputProps {
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  readonly onSubmit?: () => void;
  readonly autoFocus?: boolean;
  readonly disabled?: boolean;
  readonly error?: boolean;
  readonly tone?: 'default' | 'hero';
}

function formatBirthdayInput(value: string): string {
  const digits = value.replaceAll(/[^\d]/g, '').slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) return month;
  if (digits.length <= 4) return `${month}/${day}`;
  return `${month}/${day}/${year}`;
}

function BirthdayInput({
  value = '',
  onChange,
  onComplete,
  onSubmit,
  autoFocus = true,
  disabled = false,
  error = false,
  tone = 'default',
}: Readonly<BirthdayInputProps>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const formattedValue = formatBirthdayInput(value);

  useEffect(() => {
    if (!autoFocus) return;
    inputRef.current?.focus();
  }, [autoFocus]);

  const isHero = tone === 'hero';
  const className = isHero
    ? `${subscriptionHeroInputClassName} text-left px-3`
    : 'h-12 w-full rounded-full bg-transparent px-3 text-left text-mid font-[590] tracking-[-0.02em] text-primary-token placeholder:text-tertiary-token placeholder:opacity-70 focus-visible:outline-none focus-visible:ring-0';

  return (
    <input
      ref={inputRef}
      data-testid='inline-birthday-input'
      type='text'
      inputMode='numeric'
      disabled={disabled}
      aria-invalid={error || undefined}
      aria-label='Birthday'
      placeholder='MM/DD/YYYY'
      value={formattedValue}
      onChange={event => {
        const digits = event.target.value.replaceAll(/[^\d]/g, '').slice(0, 8);
        onChange?.(digits);

        if (digits.length === 8) {
          onComplete?.(digits);
        }
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onSubmit?.();
        }
      }}
      autoComplete='bday'
      className={className}
    />
  );
}

interface InlineInputStepProps {
  readonly inputRef?: React.RefObject<HTMLInputElement | null>;
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
  readonly ariaInvalid?: boolean;
  readonly composerTestId?: string;
  readonly tone?: 'default' | 'hero';
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
  ariaInvalid,
  composerTestId,
  tone = 'default',
}: InlineInputStepProps) {
  const isHero = tone === 'hero';
  const focusClass = isHero
    ? subscriptionHeroComposerFocusClassName
    : subscriptionComposerFocusClassName;
  const inputClass = isHero
    ? subscriptionHeroInputClassName
    : subscriptionInputClassName;
  return (
    <SubscriptionPearlComposer
      tone={tone}
      dataTestId={composerTestId ?? `${testId}-composer`}
      className={isFocused ? focusClass : ''}
      action={
        <CircularSubmitButton
          onClick={onSubmit}
          disabled={disabled}
          submitting={submitting}
          tone={tone}
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
          className={inputClass}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onFocus={onFocus}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          aria-invalid={ariaInvalid}
          autoComplete={autoComplete}
          maxLength={maxLength}
          style={noFontSynthesisStyle}
        />
      </div>
    </SubscriptionPearlComposer>
  );
}

interface StepPanelProps {
  readonly active: boolean;
  readonly children: React.ReactNode;
  readonly panelId: string;
}

function StepPanel({ active, children, panelId }: Readonly<StepPanelProps>) {
  return (
    <div
      className='step-stack-panel h-full'
      data-active={active ? 'true' : 'false'}
      data-panel={panelId}
      aria-hidden={active ? undefined : true}
    >
      {children}
    </div>
  );
}

function StepLayout({
  active,
  panelId,
  shell,
  rail,
}: Readonly<{
  active: boolean;
  panelId: string;
  shell: React.ReactNode;
  rail?: React.ReactNode;
}>) {
  return (
    <StepPanel active={active} panelId={panelId}>
      <div className='flex h-full flex-col justify-between'>
        <div>{shell}</div>
        {rail ?? <SubscriptionFeedbackRail />}
      </div>
    </StepPanel>
  );
}

interface ProfileInlineNotificationsCTAProps {
  readonly artist: Artist;
  readonly onManageNotifications?: () => void;
  readonly onRegisterReveal?: (reveal: () => void) => void;
  /** 'hero' renders the Pearl-Notify glassy dark pill over the hero image. */
  readonly variant?: 'default' | 'hero';
}

export function ProfileInlineNotificationsCTA({
  artist,
  onManageNotifications,
  onRegisterReveal,
  variant = 'default',
}: ProfileInlineNotificationsCTAProps) {
  const isHero = variant === 'hero';
  const collapsedPillClassName = isHero
    ? `${profileHeroMorphPillClassName} w-full gap-2 px-5`
    : `${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`;
  const donePillClassName = isHero
    ? `${profileHeroMorphPillClassName} w-full gap-2 px-5`
    : `${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`;
  const {
    emailInput,
    error,
    errorOrigin,
    otpCode,
    isSubmitting,
    resendCooldownEnd,
    isResending,
    handleChannelChange,
    handleEmailChange,
    handleFieldBlur,
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
    handleResendOtp,
    notificationsState,
    notificationsEnabled,
    openSubscription,
    hydrationStatus,
    subscribedChannels,
  } = useSubscriptionForm({ artist });
  const { showInlineErrorCopy, shouldShowDesktopTooltip } =
    useSubscriptionErrorFeedback({
      error,
      errorOrigin,
    });

  const [step, setStep] = useState<Step>('cta');
  const [nameInput, setNameInput] = useState('');
  const [birthdayInput, setBirthdayInput] = useState('');
  const [birthdayHintShown, setBirthdayHintShown] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const otpStepRef = useRef<HTMLDivElement>(null);
  const birthdayStepRef = useRef<HTMLDivElement>(null);
  const revealShellRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const { user } = useUserSafe();
  const prefersReducedMotion = useReducedMotion();
  const lastInteractionWasKeyboardRef = useRef(false);
  const suppressNextFocusOpenRef = useRef(false);
  const emailInputFocusedRef = useRef(false);
  // Mirror `step` into a ref so the blur guard can read the latest value
  // after its 250 ms timeout fires. Without this, the setTimeout closes
  // over whichever step was active when the blur started, which under
  // Concurrent Mode scheduling could be stale.
  const stepRef = useRef<Step>('cta');

  const nameMutation = useUpdateSubscriberNameMutation();
  const birthdayMutation = useUpdateSubscriberBirthdayMutation();
  const subscribedEmailRef = useRef<string>('');
  const lastAutoVerifiedCodeRef = useRef<string | null>(null);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isAlreadySubscribed =
    notificationsState === 'success' && hasSubscriptions;
  const revealVisualState = getRevealVisualState(
    step,
    isSubmitting,
    Boolean(error)
  );
  const revealActive = step === 'cta' || step === 'email';

  useEffect(() => {
    if (isAlreadySubscribed) {
      if (step === 'cta') {
        setStep('done');
      }
      return;
    }

    if (step === 'done') {
      setStep('cta');
    }
  }, [isAlreadySubscribed, step]);

  useEffect(() => {
    if (step === 'email' && notificationsState === 'pending_confirmation') {
      setStep('otp');
    }
  }, [step, notificationsState]);

  useEffect(() => {
    if (
      (step === 'email' || step === 'otp') &&
      notificationsState === 'success'
    ) {
      subscribedEmailRef.current = emailInput.trim();
      setStep('name');
    }
  }, [step, notificationsState, emailInput]);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const focusDelay = prefersReducedMotion
      ? EMAIL_INPUT_FOCUS_DELAY_REDUCED_MS
      : EMAIL_INPUT_FOCUS_DELAY_MS;

    if (step === 'email') {
      timeoutId = globalThis.setTimeout(() => {
        emailInputRef.current?.focus({ preventScroll: true });
      }, focusDelay);
    }

    if (step === 'otp') {
      timeoutId = globalThis.setTimeout(() => {
        otpStepRef.current
          ?.querySelector<HTMLInputElement>('input')
          ?.focus({ preventScroll: true });
      }, focusDelay);
    }

    if (step === 'name') {
      timeoutId = globalThis.setTimeout(() => {
        nameInputRef.current?.focus({ preventScroll: true });
      }, focusDelay);
    }

    if (step === 'birthday') {
      timeoutId = globalThis.setTimeout(() => {
        birthdayStepRef.current
          ?.querySelector<HTMLInputElement>('input')
          ?.focus({ preventScroll: true });
      }, focusDelay);
    }

    return () => {
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [prefersReducedMotion, step]);

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

  useEffect(() => {
    return () => clearOtpConfirmTimeout(confirmTimeoutRef);
  }, []);

  useEffect(() => {
    stepRef.current = step;
    if (step !== 'otp') {
      lastAutoVerifiedCodeRef.current = null;
    }
    if (step !== 'email') {
      emailInputFocusedRef.current = false;
    }
  }, [step]);

  const handleReveal = useCallback(() => {
    openSubscription();
    handleChannelChange('email');
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

  useEffect(() => {
    onRegisterReveal?.(handleReveal);
  }, [onRegisterReveal, handleReveal]);

  const handleEmailSubmit = useCallback(async () => {
    try {
      await handleSubscribe();
    } catch (error) {
      console.error('Failed to submit email step', error);
    }
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

  const handleBirthdaySubmit = useCallback(
    async (overrideDigits?: string) => {
      const digits = (overrideDigits ?? birthdayInput).replaceAll(/[^\d]/g, '');
      if (digits.length < 8) {
        if (!birthdayHintShown) {
          setBirthdayHintShown(true);
          return;
        }
        setStep('done');
        return;
      }
      const stored = birthdayDigitsToStorage(digits);
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
    },
    [
      birthdayInput,
      birthdayHintShown,
      artist.id,
      artist.handle,
      birthdayMutation,
    ]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      if (step === 'email') handleEmailSubmit();
      else if (step === 'name') handleNameSubmit();
      else if (step === 'birthday') handleBirthdaySubmit();
    },
    [step, handleEmailSubmit, handleNameSubmit, handleBirthdaySubmit]
  );

  const handleRevealShellBlurCapture = useCallback(() => {
    // Defer past the autofocus window so the reveal transition isn't
    // interrupted by the click-blur that precedes input mount/focus.
    // Read step via ref so the timeout sees the latest value even if
    // Concurrent Mode defers the effect that would otherwise invalidate
    // this closure.
    globalThis.setTimeout(() => {
      if (stepRef.current !== 'email') return;

      const activeElement = document.activeElement;
      if (revealShellRef.current?.contains(activeElement)) {
        return;
      }

      // Only collapse if the input actually received focus at least once.
      // Prevents flicker when blur fires before the input has mounted.
      if (!emailInputFocusedRef.current) return;

      if (!emailInput.trim() && !isSubmitting) {
        setStep('cta');
      }
    }, REVEAL_SHELL_BLUR_GUARD_MS);
  }, [emailInput, isSubmitting]);

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

  const handleOtpComplete = useCallback(
    async (value: string) => {
      if (lastAutoVerifiedCodeRef.current === value) {
        return;
      }

      lastAutoVerifiedCodeRef.current = value;
      try {
        await handleVerifyOtp(value);
      } catch (error) {
        console.error('Failed to verify OTP on completion', error);
      }
    },
    [handleVerifyOtp]
  );

  if (hydrationStatus === 'checking') {
    return (
      <div
        data-testid='profile-inline-cta'
        data-ui='step-stack'
        className='min-h-[116px]'
      >
        <SubscriptionFormSkeleton />
      </div>
    );
  }

  if (!notificationsEnabled) {
    return null;
  }

  return (
    <div
      data-testid='profile-inline-cta'
      data-ui='step-stack'
      data-tone={isHero ? 'hero' : 'default'}
      className={
        isHero ? heroComposerWrapperClassName : inlineComposerWrapperClassName
      }
    >
      <div className='step-stack-track h-full'>
        <StepLayout
          active={revealActive}
          panelId='reveal'
          shell={
            <div
              ref={revealShellRef}
              data-ui='cta-reveal'
              data-visual-state={revealVisualState}
              onBlurCapture={handleRevealShellBlurCapture}
              style={
                {
                  '--cta-reveal-min-height': '48px',
                  '--cta-reveal-border': 'transparent',
                  '--cta-reveal-border-active': 'transparent',
                  '--cta-reveal-surface': 'transparent',
                  '--cta-reveal-surface-active': 'transparent',
                  '--cta-reveal-shadow': 'none',
                  '--cta-reveal-shadow-active': 'none',
                } as CSSProperties
              }
            >
              <div className='cta-reveal-shell'>
                <div className='cta-reveal-panel cta-reveal-panel--cta'>
                  <button
                    type='button'
                    onClick={handleReveal}
                    className={collapsedPillClassName}
                    style={noFontSynthesisStyle}
                  >
                    <Bell className='h-4 w-4' />
                    {isHero
                      ? 'Notify me about new releases'
                      : 'Turn on notifications'}
                  </button>
                </div>

                <div className='cta-reveal-panel cta-reveal-panel--form'>
                  <InlineInputStep
                    inputRef={emailInputRef}
                    inputId={`${inputId}-email`}
                    testId='inline-email-input'
                    composerTestId='inline-email-input-composer'
                    label='Email address'
                    type='email'
                    inputMode='email'
                    placeholder='your@email.com'
                    value={emailInput}
                    onChange={e => handleEmailChange(e.target.value)}
                    onSubmit={handleEmailSubmit}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                      setIsInputFocused(true);
                      emailInputFocusedRef.current = true;
                    }}
                    onBlur={() => {
                      setIsInputFocused(false);
                      handleFieldBlur();
                    }}
                    disabled={isSubmitting}
                    submitting={isSubmitting}
                    isFocused={isInputFocused}
                    ariaInvalid={error ? true : undefined}
                    autoComplete='email'
                    maxLength={254}
                    tone={isHero ? 'hero' : 'default'}
                  />
                </div>
              </div>
            </div>
          }
          rail={
            <SubscriptionFeedbackRail
              message={
                step === 'email' && error && showInlineErrorCopy ? (
                  <span role='alert'>{error}</span>
                ) : step === 'email' && isInputFocused ? (
                  'No spam. Opt-out anytime.'
                ) : null
              }
              sideAction={
                step === 'email' && error && shouldShowDesktopTooltip ? (
                  <SubscriptionDesktopErrorIndicator error={error} />
                ) : null
              }
            />
          }
        />

        <StepLayout
          active={step === 'otp'}
          panelId='otp'
          shell={
            <div ref={otpStepRef}>
              <SubscriptionPearlComposer
                tone={isHero ? 'hero' : 'default'}
                dataTestId='inline-otp-composer'
                action={
                  <CircularSubmitButton
                    onClick={async () => {
                      try {
                        await handleVerifyOtp();
                      } catch (error) {
                        console.error('Failed to verify OTP', error);
                      }
                    }}
                    disabled={otpCode.length !== 6 || isSubmitting}
                    submitting={isSubmitting}
                    tone={isHero ? 'hero' : 'default'}
                  />
                }
              >
                <div className='min-w-0 flex-1 px-1 py-1'>
                  <OtpInput
                    value={otpCode}
                    onChange={value => {
                      handleOtpChange(value);
                      if (confirmMessage) setConfirmMessage(null);
                    }}
                    onComplete={handleOtpComplete}
                    autoFocus={step === 'otp'}
                    aria-label='Enter 6-digit verification code'
                    disabled={isSubmitting}
                    error={Boolean(error)}
                    size={isHero ? 'hero' : 'compact'}
                    showProgressDots={false}
                  />
                </div>
              </SubscriptionPearlComposer>
            </div>
          }
          rail={
            <SubscriptionFeedbackRail
              message={
                error && showInlineErrorCopy ? (
                  <span role='alert'>{error}</span>
                ) : confirmMessage && !error ? (
                  <span className={subscriptionSuccessTextClassName}>
                    {confirmMessage}
                  </span>
                ) : (
                  'Enter the 6-digit code we sent to your email.'
                )
              }
              sideAction={
                <>
                  {error && shouldShowDesktopTooltip ? (
                    <SubscriptionDesktopErrorIndicator error={error} />
                  ) : null}
                  <SubscriptionOtpResendAction
                    resendCooldownEnd={resendCooldownEnd}
                    isResending={isResending}
                    onResend={() => {
                      requestOtpResendConfirmation({
                        handleResendOtp,
                        confirmTimeoutRef,
                        setConfirmMessage,
                      });
                    }}
                  />
                </>
              }
            />
          }
        />

        <StepLayout
          active={step === 'name'}
          panelId='name'
          shell={
            <InlineInputStep
              inputRef={nameInputRef}
              inputId={`${inputId}-name`}
              testId='inline-name-input'
              label='First name'
              placeholder="What's your name?"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onSubmit={async () => {
                try {
                  await handleNameSubmit();
                } catch (error) {
                  console.error('Failed to submit name step', error);
                }
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              disabled={nameMutation.isPending}
              submitting={nameMutation.isPending}
              isFocused={isInputFocused}
              autoComplete='given-name'
              maxLength={100}
              tone={isHero ? 'hero' : 'default'}
            />
          }
        />

        <StepLayout
          active={step === 'birthday'}
          panelId='birthday'
          shell={
            <div ref={birthdayStepRef}>
              <SubscriptionPearlComposer
                tone={isHero ? 'hero' : 'default'}
                dataTestId='inline-birthday-composer'
                action={
                  <CircularSubmitButton
                    onClick={async () => {
                      try {
                        await handleBirthdaySubmit();
                      } catch (error) {
                        console.error('Failed to submit birthday step', error);
                      }
                    }}
                    disabled={birthdayMutation.isPending}
                    submitting={birthdayMutation.isPending}
                    tone={isHero ? 'hero' : 'default'}
                  />
                }
              >
                <div className='min-w-0 flex-1'>
                  <BirthdayInput
                    value={birthdayInput}
                    onChange={value => {
                      setBirthdayInput(value);
                      if (birthdayHintShown) setBirthdayHintShown(false);
                    }}
                    onComplete={async value => {
                      try {
                        await handleBirthdaySubmit(value);
                      } catch (error) {
                        console.error(
                          'Failed to submit birthday completion',
                          error
                        );
                      }
                    }}
                    onSubmit={async () => {
                      try {
                        await handleBirthdaySubmit();
                      } catch (error) {
                        console.error('Failed to submit birthday step', error);
                      }
                    }}
                    autoFocus={step === 'birthday'}
                    disabled={birthdayMutation.isPending}
                    tone={isHero ? 'hero' : 'default'}
                  />
                </div>
              </SubscriptionPearlComposer>
            </div>
          }
          rail={
            <SubscriptionFeedbackRail
              message={
                birthdayHintShown ? (
                  'Enter full date to save'
                ) : (
                  <span aria-hidden='true'>.</span>
                )
              }
            />
          }
        />

        <StepLayout
          active={step === 'done'}
          panelId='done'
          shell={
            <button
              type='button'
              data-testid='inline-notifications-on-button'
              onClick={handleManageNotifications}
              onFocus={handleManageButtonFocus}
              onBlur={handleManageButtonBlur}
              onKeyDown={handleManageButtonKeyDown}
              className={donePillClassName}
              style={noFontSynthesisStyle}
              aria-label='Manage notifications'
              aria-haspopup='dialog'
            >
              <CheckCircle2
                className='h-4 w-4 shrink-0 text-green-400'
                aria-hidden='true'
              />
              <span className='text-[14px] font-[560] tracking-[-0.015em] text-white/88'>
                {isHero ? "You're on the list" : 'Notifications on'}
              </span>
            </button>
          }
        />
      </div>
    </div>
  );
}
