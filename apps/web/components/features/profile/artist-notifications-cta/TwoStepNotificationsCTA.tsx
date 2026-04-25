'use client';

import { Mail, Phone } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';

import { OtpInput } from '@/features/auth/atoms/otp-input';
import {
  type CountryOption,
  CountrySelector,
} from '@/features/profile/notifications';
import { useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { Artist } from '@/types/db';
import {
  clearOtpConfirmTimeout,
  noFontSynthesisStyle,
  profileQuietIconButtonClassName,
  requestOtpResendConfirmation,
  SubscriptionDesktopErrorIndicator,
  SubscriptionFeedbackRail,
  SubscriptionFormSkeleton,
  SubscriptionOtpResendAction,
  SubscriptionPearlComposer,
  SubscriptionSuccess,
  subscriptionComposerFocusClassName,
  subscriptionHeadingClassName,
  subscriptionInputClassName,
  subscriptionPrimaryActionClassName,
  subscriptionSuccessTextClassName,
  useSubscriptionErrorFeedback,
} from './shared';
import { useSubscriptionForm } from './useSubscriptionForm';
import { formatPhoneDigitsForDisplay, getMaxNationalDigits } from './utils';

type Step = 'button' | 'input';

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

interface TwoStepNotificationsCTAProps {
  readonly artist: Artist;
  readonly startExpanded?: boolean;
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
      experiment_group: 'two_step',
    });
    setTracked(true);
  }, [tracked, handle]);
}

function getInputConfig(channel: 'email' | 'sms') {
  return channel === 'sms'
    ? {
        type: 'tel' as const,
        inputMode: 'numeric' as const,
        placeholder: '(555) 123-4567',
        autoComplete: 'tel-national',
        maxLength: 32,
      }
    : {
        type: 'email' as const,
        inputMode: 'email' as const,
        placeholder: 'your@email.com',
        autoComplete: 'email',
        maxLength: 254,
      };
}

function getPhonePrefillValue(
  phone: string | null | undefined,
  dialCode: string
): string {
  if (!phone) return '';
  const digitsOnly = phone.replaceAll(/[^\d]/g, '');
  const dialDigits = dialCode.replace('+', '');
  const withoutCountryCode = digitsOnly.startsWith(dialDigits)
    ? digitsOnly.slice(dialDigits.length)
    : digitsOnly;
  return withoutCountryCode.slice(0, getMaxNationalDigits(dialCode));
}

function getSubmitLabel(isSubmitting: boolean, otpStep: string): string {
  if (isSubmitting) return 'Working\u2026';
  if (otpStep === 'verify') return 'Verify';
  return 'Turn on notifications';
}

function getHeading(otpStep: string): string {
  return otpStep === 'verify'
    ? 'Check your inbox. Enter your code.'
    : 'Never miss a release.';
}

function getChannelToggleLabel(channel: 'email' | 'sms'): string {
  return channel === 'sms'
    ? 'Switch to email updates'
    : 'Switch to text updates';
}

interface ChannelInputRowProps {
  readonly shouldShowCountrySelector: boolean;
  readonly country: CountryOption;
  readonly isCountryOpen: boolean;
  readonly setIsCountryOpen: (open: boolean) => void;
  readonly setCountry: (c: CountryOption) => void;
  readonly channel: 'email' | 'sms';
  readonly handleChannelChange: (ch: 'email' | 'sms') => void;
  readonly isSubmitting: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly inputId: string;
  readonly disclaimerId: string;
  readonly inputConfig: ReturnType<typeof getInputConfig>;
  readonly inputValue: string;
  readonly otpCode: string;
  readonly handlePhoneChange: (v: string) => void;
  readonly handleEmailChange: (v: string) => void;
  readonly handleOtpChange: (v: string) => void;
  readonly isInputFocused: boolean;
  readonly setIsInputFocused: (f: boolean) => void;
  readonly handleFieldBlur: () => void;
  readonly handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  readonly otpStep: string;
  readonly handleVerifyOtp: () => Promise<void>;
  readonly handleSubscribe: () => Promise<void>;
  readonly smsEnabled: boolean;
  readonly error: string | null;
}

function ChannelInputRow({
  shouldShowCountrySelector,
  country,
  isCountryOpen,
  setIsCountryOpen,
  setCountry,
  channel,
  handleChannelChange,
  isSubmitting,
  inputRef,
  inputId,
  disclaimerId,
  inputConfig,
  inputValue,
  otpCode,
  handlePhoneChange,
  handleEmailChange,
  handleOtpChange,
  isInputFocused,
  setIsInputFocused,
  handleFieldBlur,
  handleKeyDown,
  otpStep,
  handleVerifyOtp,
  handleSubscribe,
  smsEnabled,
  error,
}: ChannelInputRowProps) {
  const handleSubmit = () => {
    const action = otpStep === 'verify' ? handleVerifyOtp() : handleSubscribe();
    action.catch(() => {});
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (channel === 'sms') {
      handlePhoneChange(event.target.value);
    } else {
      handleEmailChange(event.target.value);
    }
  };

  let leftSlot: React.ReactNode;
  if (otpStep === 'verify') {
    leftSlot = undefined;
  } else if (shouldShowCountrySelector) {
    leftSlot = (
      <CountrySelector
        country={country}
        isOpen={isCountryOpen}
        onOpenChange={setIsCountryOpen}
        onSelect={setCountry}
      />
    );
  } else if (smsEnabled) {
    leftSlot = (
      <button
        type='button'
        className={`flex h-10 w-10 items-center justify-center rounded-full ${profileQuietIconButtonClassName} transition-colors focus-visible:outline-none`}
        aria-label={getChannelToggleLabel(channel)}
        onClick={() => handleChannelChange(channel === 'sms' ? 'email' : 'sms')}
        disabled={isSubmitting}
      >
        {channel === 'sms' ? (
          <Phone className='w-4 h-4' aria-hidden='true' />
        ) : (
          <Mail className='w-4 h-4' aria-hidden='true' />
        )}
      </button>
    );
  }

  let composerClassName = '';
  if (otpStep === 'verify') {
    composerClassName = 'px-3 py-3';
  } else if (isInputFocused) {
    composerClassName = subscriptionComposerFocusClassName;
  }

  return (
    <SubscriptionPearlComposer
      layout={otpStep === 'verify' ? 'stacked' : 'inline'}
      dataTestId='subscription-pearl-composer'
      leftSlot={leftSlot}
      action={
        <button
          type='button'
          onClick={handleSubmit}
          disabled={isSubmitting || (otpStep === 'verify' && Boolean(error))}
          className={subscriptionPrimaryActionClassName}
          style={noFontSynthesisStyle}
        >
          {getSubmitLabel(isSubmitting, otpStep)}
        </button>
      }
      className={composerClassName}
    >
      {otpStep === 'verify' ? (
        <div className='px-2 py-2'>
          <OtpInput
            value={otpCode}
            onChange={handleOtpChange}
            onComplete={() => {
              if (!error) handleVerifyOtp().catch(() => {});
            }}
            autoFocus
            aria-label='Enter 6-digit verification code'
            disabled={isSubmitting}
            error={Boolean(error)}
          />
        </div>
      ) : (
        <div className='min-w-0'>
          <label htmlFor={inputId} className='sr-only'>
            {channel === 'sms' ? 'Phone number' : 'Email address'}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            data-testid='subscription-input'
            aria-describedby={disclaimerId}
            type={inputConfig.type}
            inputMode={inputConfig.inputMode}
            className={subscriptionInputClassName}
            placeholder={inputConfig.placeholder}
            value={inputValue}
            onChange={handleInputChange}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => {
              setIsInputFocused(false);
              handleFieldBlur();
            }}
            onKeyDown={handleKeyDown}
            disabled={isSubmitting}
            aria-invalid={error ? true : undefined}
            autoComplete={inputConfig.autoComplete}
            maxLength={inputConfig.maxLength}
            style={noFontSynthesisStyle}
          />
        </div>
      )}
    </SubscriptionPearlComposer>
  );
}

function useAutoFocusOnInputStep(
  step: Step,
  inputRef: React.RefObject<HTMLInputElement | null>,
  prefersReducedMotion: boolean | null
) {
  useEffect(() => {
    if (step !== 'input') return;
    const delay = prefersReducedMotion ? 0 : 350;
    const timeoutId = globalThis.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, delay);
    return () => globalThis.clearTimeout(timeoutId);
  }, [step, prefersReducedMotion, inputRef]);
}

function useStepSyncWithNotificationsState(
  notificationsState: string,
  setStep: (s: Step) => void
) {
  useEffect(() => {
    if (
      notificationsState === 'editing' ||
      notificationsState === 'pending_confirmation'
    ) {
      setStep('input');
    }
  }, [notificationsState, setStep]);
}

function useRedirectIfSubscribed(
  isSubscribed: boolean,
  artistName: string,
  artistHandle: string
) {
  const router = useRouter();
  const { info: showInfo } = useNotifications();
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!isSubscribed || hasRedirected.current) return;
    hasRedirected.current = true;
    showInfo(`You're already subscribed to ${artistName}`);
    router.replace(`/${artistHandle}`);
  }, [isSubscribed, artistName, artistHandle, router, showInfo]);
}

interface PrefillInputParams {
  step: Step;
  notificationsState: string;
  channel: 'email' | 'sms';
  emailInput: string;
  phoneInput: string;
  dialCode: string;
  primaryEmail: string;
  primaryPhone: string;
  handleEmailChange: (v: string) => void;
  handlePhoneChange: (v: string) => void;
}

function usePrefillInput({
  step,
  notificationsState,
  channel,
  emailInput,
  phoneInput,
  dialCode,
  primaryEmail,
  primaryPhone,
  handleEmailChange,
  handlePhoneChange,
}: PrefillInputParams) {
  useEffect(() => {
    if (step !== 'input' || notificationsState !== 'editing') return;

    if (channel === 'email' && !emailInput && primaryEmail) {
      handleEmailChange(primaryEmail);
      return;
    }

    if (channel === 'sms' && !phoneInput && primaryPhone) {
      handlePhoneChange(getPhonePrefillValue(primaryPhone, dialCode));
    }
  }, [
    channel,
    dialCode,
    emailInput,
    handleEmailChange,
    handlePhoneChange,
    notificationsState,
    phoneInput,
    primaryEmail,
    primaryPhone,
    step,
  ]);
}

interface TwoStepFeedbackMessageParams {
  readonly error: string | null;
  readonly showInlineErrorCopy: boolean;
  readonly disclaimerId: string;
  readonly confirmMessage: string | null;
  readonly otpStep: string;
  readonly isInputFocused: boolean;
}

function getTwoStepFeedbackMessage({
  error,
  showInlineErrorCopy,
  disclaimerId,
  confirmMessage,
  otpStep,
  isInputFocused,
}: TwoStepFeedbackMessageParams): React.ReactNode {
  if (error && showInlineErrorCopy) {
    return (
      <span id={disclaimerId} role='alert'>
        {error}
      </span>
    );
  }
  if (confirmMessage) {
    return (
      <span id={disclaimerId} className={subscriptionSuccessTextClassName}>
        {confirmMessage}
      </span>
    );
  }
  if (otpStep === 'verify') {
    return (
      <span id={disclaimerId}>
        Enter the 6-digit code we sent to your email.
      </span>
    );
  }
  if (isInputFocused) {
    return <span id={disclaimerId}>No spam. Opt-out anytime.</span>;
  }
  return null;
}

export function TwoStepNotificationsCTA({
  artist,
  startExpanded = false,
}: TwoStepNotificationsCTAProps) {
  const {
    country,
    setCountry,
    phoneInput,
    emailInput,
    error,
    errorOrigin,
    otpCode,
    otpStep,
    isSubmitting,
    isCountryOpen,
    setIsCountryOpen,
    resendCooldownEnd,
    isResending,
    channel,
    subscribedChannels,
    handleChannelChange,
    handlePhoneChange,
    handleEmailChange,
    handleFieldBlur,
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
    handleResendOtp,
    handleKeyDown,
    notificationsState,
    notificationsEnabled,
    openSubscription,
    hydrationStatus,
    smsEnabled,
  } = useSubscriptionForm({ artist });

  const [step, setStep] = useState<Step>(startExpanded ? 'input' : 'button');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const disclaimerId = useId();
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const { user } = useUserSafe();
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showInlineErrorCopy, shouldShowDesktopTooltip } =
    useSubscriptionErrorFeedback({
      error,
      errorOrigin,
    });

  useImpressionTracking(artist.handle);

  const handleReveal = useCallback(() => {
    openSubscription();
    setStep('input');
    track('subscribe_step_reveal', {
      handle: artist.handle,
      source: 'profile_inline',
    });
  }, [artist.handle, openSubscription]);

  useEffect(() => {
    if (startExpanded) {
      openSubscription();
      setStep('input');
    }
  }, [openSubscription, startExpanded]);

  useStepSyncWithNotificationsState(notificationsState, setStep);

  usePrefillInput({
    step,
    notificationsState,
    channel,
    emailInput,
    phoneInput,
    dialCode: country.dialCode,
    primaryEmail: user?.primaryEmailAddress?.emailAddress ?? '',
    primaryPhone: user?.primaryPhoneNumber?.phoneNumber ?? '',
    handleEmailChange,
    handlePhoneChange,
  });

  useAutoFocusOnInputStep(step, inputRef, prefersReducedMotion);

  useEffect(() => {
    return () => clearOtpConfirmTimeout(confirmTimeoutRef);
  }, []);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;

  useRedirectIfSubscribed(isSubscribed, artist.name, artist.handle);

  if (hydrationStatus === 'checking') {
    return <SubscriptionFormSkeleton />;
  }

  if (isSubscribed) {
    return (
      <SubscriptionSuccess
        artistName={artist.name}
        handle={artist.handle}
        subscribedChannels={subscribedChannels}
      />
    );
  }

  if (!notificationsEnabled) {
    return null;
  }

  const instant = prefersReducedMotion === true;
  const enterVariant = getEnterVariant(instant);
  const shouldShowCountrySelector =
    otpStep === 'input' && channel === 'sms' && phoneInput.length > 0;
  const inputConfig = getInputConfig(channel);
  const inputValue =
    channel === 'sms'
      ? formatPhoneDigitsForDisplay(phoneInput, country.dialCode)
      : emailInput;
  const handleOtpResend = () => {
    requestOtpResendConfirmation({
      handleResendOtp,
      confirmTimeoutRef,
      setConfirmMessage,
    });
  };

  let feedbackSideAction: React.ReactNode;
  if (otpStep === 'verify') {
    feedbackSideAction = (
      <>
        {error && shouldShowDesktopTooltip ? (
          <SubscriptionDesktopErrorIndicator error={error} />
        ) : null}
        <SubscriptionOtpResendAction
          resendCooldownEnd={resendCooldownEnd}
          isResending={isResending}
          onResend={handleOtpResend}
        />
      </>
    );
  } else if (error && shouldShowDesktopTooltip) {
    feedbackSideAction = <SubscriptionDesktopErrorIndicator error={error} />;
  }

  return (
    <div
      className='space-y-4 sm:space-y-5'
      data-testid='subscribe-cta-container'
    >
      <p className={subscriptionHeadingClassName} style={noFontSynthesisStyle}>
        {getHeading(otpStep)}
      </p>

      <AnimatePresence mode='wait' initial={false}>
        {step === 'button' ? (
          <motion.div key='cta-button' exit={getExitVariant(instant)}>
            <button
              type='button'
              onClick={handleReveal}
              className={`${subscriptionPrimaryActionClassName} h-12 w-full justify-center px-6`}
              style={noFontSynthesisStyle}
            >
              Turn on notifications
            </button>
          </motion.div>
        ) : (
          <motion.div
            key='cta-input'
            initial={enterVariant.initial}
            animate={enterVariant.animate}
          >
            <div className='space-y-4 sm:space-y-5'>
              <ChannelInputRow
                shouldShowCountrySelector={shouldShowCountrySelector}
                country={country}
                isCountryOpen={isCountryOpen}
                setIsCountryOpen={setIsCountryOpen}
                setCountry={setCountry}
                channel={channel}
                handleChannelChange={handleChannelChange}
                isSubmitting={isSubmitting}
                inputRef={inputRef}
                inputId={inputId}
                disclaimerId={disclaimerId}
                inputConfig={inputConfig}
                inputValue={inputValue}
                otpCode={otpCode}
                handlePhoneChange={handlePhoneChange}
                handleEmailChange={handleEmailChange}
                handleOtpChange={handleOtpChange}
                isInputFocused={isInputFocused}
                setIsInputFocused={setIsInputFocused}
                handleFieldBlur={handleFieldBlur}
                handleKeyDown={handleKeyDown}
                otpStep={otpStep}
                handleVerifyOtp={handleVerifyOtp}
                handleSubscribe={handleSubscribe}
                smsEnabled={smsEnabled}
                error={error}
              />
              <SubscriptionFeedbackRail
                message={getTwoStepFeedbackMessage({
                  error,
                  showInlineErrorCopy,
                  disclaimerId,
                  confirmMessage,
                  otpStep,
                  isInputFocused,
                })}
                sideAction={feedbackSideAction}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
