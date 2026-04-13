'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { AlertCircle, Mail, Phone } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';

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
  noFontSynthesisStyle,
  SubscriptionFormSkeleton,
  SubscriptionPearlComposer,
  SubscriptionSuccess,
  subscriptionComposerFocusClassName,
  subscriptionDisclaimerClassName,
  subscriptionHeadingClassName,
  subscriptionInputClassName,
  subscriptionPrimaryActionClassName,
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
  return 'Get notified';
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

  return (
    <SubscriptionPearlComposer
      layout={otpStep === 'verify' ? 'stacked' : 'inline'}
      dataTestId='subscription-pearl-composer'
      leftSlot={
        otpStep === 'verify' ? undefined : shouldShowCountrySelector ? (
          <CountrySelector
            country={country}
            isOpen={isCountryOpen}
            onOpenChange={setIsCountryOpen}
            onSelect={setCountry}
          />
        ) : smsEnabled ? (
          <button
            type='button'
            className='flex h-12 items-center justify-center rounded-full px-3 text-primary-token/68 transition-colors hover:text-primary-token focus-visible:outline-none'
            aria-label={getChannelToggleLabel(channel)}
            onClick={() =>
              handleChannelChange(channel === 'sms' ? 'email' : 'sms')
            }
            disabled={isSubmitting}
          >
            {channel === 'sms' ? (
              <Phone className='w-4 h-4' aria-hidden='true' />
            ) : (
              <Mail className='w-4 h-4' aria-hidden='true' />
            )}
          </button>
        ) : undefined
      }
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
      className={
        otpStep === 'verify'
          ? 'px-3 py-3'
          : isInputFocused
            ? subscriptionComposerFocusClassName
            : ''
      }
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
            autoComplete={inputConfig.autoComplete}
            maxLength={inputConfig.maxLength}
            style={noFontSynthesisStyle}
          />
        </div>
      )}
    </SubscriptionPearlComposer>
  );
}

function ErrorTooltip({ error }: { readonly error: string }) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <span
            className='absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center gap-1.5 text-sm text-red-500 dark:text-red-400'
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
  );
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
    otpCode,
    otpStep,
    isSubmitting,
    isCountryOpen,
    setIsCountryOpen,
    channel,
    subscribedChannels,
    handleChannelChange,
    handlePhoneChange,
    handleEmailChange,
    handleFieldBlur,
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
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
  const prefersReducedMotion = useReducedMotion();
  const { user } = useUserSafe();

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

  useEffect(() => {
    if (
      notificationsState === 'editing' ||
      notificationsState === 'pending_confirmation'
    ) {
      setStep('input');
    }
  }, [notificationsState]);

  useEffect(() => {
    if (step !== 'input' || notificationsState !== 'editing') return;

    const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? '';
    const primaryPhone = user?.primaryPhoneNumber?.phoneNumber ?? '';

    if (channel === 'email' && !emailInput && primaryEmail) {
      handleEmailChange(primaryEmail);
      return;
    }

    if (channel === 'sms' && !phoneInput && primaryPhone) {
      handlePhoneChange(getPhonePrefillValue(primaryPhone, country.dialCode));
    }
  }, [
    channel,
    country.dialCode,
    emailInput,
    handleEmailChange,
    handlePhoneChange,
    notificationsState,
    phoneInput,
    step,
    user,
  ]);

  // Auto-focus the input after transition
  useEffect(() => {
    if (step !== 'input') return;
    const timeoutId = globalThis.setTimeout(
      () => {
        inputRef.current?.focus({ preventScroll: true });
      },
      prefersReducedMotion ? 0 : 350
    );
    return () => globalThis.clearTimeout(timeoutId);
  }, [step, prefersReducedMotion]);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;

  // Redirect to normal profile when already subscribed (subscribe mode)
  const router = useRouter();
  const { info: showInfo } = useNotifications();
  const hasRedirected = useRef(false);
  useEffect(() => {
    if (!isSubscribed || hasRedirected.current) return;
    hasRedirected.current = true;
    showInfo(`You're already subscribed to ${artist.name}`);
    router.replace(`/${artist.handle}`);
  }, [isSubscribed, artist.name, artist.handle, router, showInfo]);

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

              <div className='relative min-h-5'>
                <p
                  id={disclaimerId}
                  className={`${subscriptionDisclaimerClassName} transition-opacity duration-200 ${
                    isInputFocused && !error ? 'opacity-100' : 'opacity-0'
                  } text-center`}
                  style={noFontSynthesisStyle}
                  aria-hidden={!isInputFocused || Boolean(error)}
                >
                  No spam. Opt-out anytime.
                </p>

                {error && <ErrorTooltip error={error} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
