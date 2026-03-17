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
  SubscriptionPendingConfirmation,
  SubscriptionSuccess,
} from './shared';
import { useSubscriptionForm } from './useSubscriptionForm';
import { formatPhoneDigitsForDisplay, getMaxNationalDigits } from './utils';

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
  readonly handlePhoneChange: (v: string) => void;
  readonly handleEmailChange: (v: string) => void;
  readonly setIsInputFocused: (f: boolean) => void;
  readonly handleFieldBlur: () => void;
  readonly handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  readonly otpStep: string;
  readonly handleVerifyOtp: () => Promise<void>;
  readonly handleSubscribe: () => Promise<void>;
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
  handlePhoneChange,
  handleEmailChange,
  setIsInputFocused,
  handleFieldBlur,
  handleKeyDown,
  otpStep,
  handleVerifyOtp,
  handleSubscribe,
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
    <div className='rounded-2xl bg-surface-0 backdrop-blur-md ring-1 ring-(--color-border-subtle) shadow-sm focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))] transition-[box-shadow,ring] overflow-hidden'>
      <div className='flex items-center'>
        {shouldShowCountrySelector ? (
          <CountrySelector
            country={country}
            isOpen={isCountryOpen}
            onOpenChange={setIsCountryOpen}
            onSelect={setCountry}
          />
        ) : (
          <button
            type='button'
            className='h-12 pl-4 pr-3 flex items-center bg-transparent text-tertiary-token hover:bg-surface-2 transition-colors focus-visible:outline-none'
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
        )}

        <div className='flex-1 min-w-0'>
          <label htmlFor={inputId} className='sr-only'>
            {channel === 'sms' ? 'Phone number' : 'Email address'}
          </label>
          <input
            ref={inputRef}
            id={inputId}
            aria-describedby={disclaimerId}
            type={inputConfig.type}
            inputMode={inputConfig.inputMode}
            className='w-full h-12 px-4 bg-transparent text-[15px] text-primary-token placeholder:text-tertiary-token placeholder:opacity-80 border-none focus-visible:outline-none focus-visible:ring-0'
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

        <button
          type='button'
          onClick={handleSubmit}
          disabled={isSubmitting}
          className='mr-1.5 inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-btn-primary px-3 text-sm font-medium text-btn-primary-foreground transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus-ring-themed'
          style={noFontSynthesisStyle}
        >
          {getSubmitLabel(isSubmitting, otpStep)}
        </button>
      </div>
    </div>
  );
}

function ErrorTooltip({ error }: { readonly error: string }) {
  return (
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
  );
}

export function TwoStepNotificationsCTA({
  artist,
}: TwoStepNotificationsCTAProps) {
  const {
    country,
    setCountry,
    phoneInput,
    emailInput,
    error,
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
    handleSubscribe,
    handleVerifyOtp,
    handleKeyDown,
    notificationsState,
    notificationsEnabled,
    openSubscription,
    hydrationStatus,
  } = useSubscriptionForm({ artist });

  const [step, setStep] = useState<Step>('button');
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
    if (notificationsState === 'editing') {
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

  if (notificationsState === 'pending_confirmation') {
    return <SubscriptionPendingConfirmation />;
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
    <div className='space-y-3'>
      <p
        className='text-center text-sm font-semibold text-primary-token'
        style={noFontSynthesisStyle}
      >
        Never miss a release.
      </p>

      <AnimatePresence mode='wait' initial={false}>
        {step === 'button' ? (
          <motion.div key='cta-button' exit={getExitVariant(instant)}>
            <button
              type='button'
              onClick={handleReveal}
              className='w-full inline-flex items-center justify-center rounded-xl bg-btn-primary px-8 py-4 text-base font-semibold text-btn-primary-foreground shadow-sm transition-[transform,opacity] duration-150 ease-[cubic-bezier(0.33,.01,.27,1)] hover:opacity-90 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
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
            <div className='space-y-3'>
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
                handlePhoneChange={handlePhoneChange}
                handleEmailChange={handleEmailChange}
                setIsInputFocused={setIsInputFocused}
                handleFieldBlur={handleFieldBlur}
                handleKeyDown={handleKeyDown}
                otpStep={otpStep}
                handleVerifyOtp={handleVerifyOtp}
                handleSubscribe={handleSubscribe}
              />

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

                {error && <ErrorTooltip error={error} />}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
