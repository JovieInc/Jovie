'use client';

import { AlertCircle, Bell, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/atoms/Tooltip';

/** Prevents synthetic font weight rendering for better typography */
const noFontSynthesisStyle: CSSProperties = { fontSynthesisWeight: 'none' };

import { Skeleton } from '@/components/atoms/Skeleton';
import { CountrySelector } from '@/components/profile/notifications';
import { CTAButton } from '@/components/ui/CTAButton';
import { track } from '@/lib/analytics';
import type { ArtistNotificationsCTAProps } from './types';
import { useSubscriptionForm } from './useSubscriptionForm';
import { formatPhoneDigitsForDisplay, getMaxNationalDigits } from './utils';

/**
 * Loading skeleton - shown during hydration while checking subscription status
 */
function SubscriptionFormSkeleton() {
  return (
    <output className='block space-y-3' aria-busy='true'>
      <span className='sr-only'>Loading subscription form</span>
      {/* Input area skeleton */}
      <Skeleton className='h-12 w-full rounded-2xl' />
      {/* Button skeleton */}
      <Skeleton className='h-11 w-full rounded-md' />
      {/* Disclaimer area skeleton - fixed height to prevent layout shift */}
      <div className='h-4' />
    </output>
  );
}

/**
 * Listen Now CTA - shown when notifications are disabled or in idle state
 */
function ListenNowCTA({
  variant,
  handle,
}: {
  variant: 'button' | 'link';
  handle: string;
}) {
  const listenHref = `/${handle}?mode=listen`;

  if (variant === 'button') {
    return (
      <CTAButton
        href={listenHref}
        variant='primary'
        size='lg'
        className='w-full'
      >
        Listen Now
      </CTAButton>
    );
  }

  return (
    <Link
      href={listenHref}
      prefetch
      className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl bg-btn-primary text-btn-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:opacity-95 focus-ring-transparent-offset'
    >
      Listen Now
    </Link>
  );
}

/**
 * Success state - shown when user has subscribed
 */
function SubscriptionSuccess() {
  return (
    <div className='space-y-1'>
      <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-btn-primary text-btn-primary-foreground shadow-lg transition-colors duration-200'>
        <Bell className='w-5 h-5 mr-2 text-accent-bright' aria-hidden='true' />
        <span className='font-semibold'>Subscribed to notifications</span>
      </div>
      <p className='text-xs text-center text-secondary-token'>
        You&apos;ll now receive updates from this artist. Tap the bell to add
        another channel or unsubscribe.
      </p>
    </div>
  );
}

interface ChannelToggleProps {
  channel: 'email' | 'sms';
  isSubmitting: boolean;
  onChannelChange: (channel: 'email' | 'sms') => void;
}

/**
 * Channel toggle button (Email <-> SMS)
 */
function ChannelToggle({
  channel,
  isSubmitting,
  onChannelChange,
}: ChannelToggleProps) {
  return (
    <button
      type='button'
      className='h-12 pl-4 pr-3 flex items-center bg-transparent text-tertiary-token hover:bg-surface-2 transition-colors focus-visible:outline-none'
      aria-label={
        channel === 'sms' ? 'Switch to email updates' : 'Switch to text updates'
      }
      onClick={() => onChannelChange(channel === 'sms' ? 'email' : 'sms')}
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

function useInputFocusRegistration(
  inputRef: React.RefObject<HTMLInputElement | null>,
  registerInputFocus: (fn: (() => void) | null) => void
) {
  useEffect(() => {
    registerInputFocus(() => inputRef.current?.focus());
    return () => registerInputFocus(null);
  }, [registerInputFocus, inputRef]);
}

function usePhoneInputConstraint(
  dialCode: string,
  phoneInput: string,
  handlePhoneChange: (value: string) => void
) {
  useEffect(() => {
    const maxNationalDigits = getMaxNationalDigits(dialCode);
    if (phoneInput.length > maxNationalDigits) {
      handlePhoneChange(phoneInput.slice(0, maxNationalDigits));
    }
  }, [dialCode, handlePhoneChange, phoneInput]);
}

function useAutoFocusOnEdit(
  notificationsState: string,
  inputRef: React.RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    if (notificationsState !== 'editing' || !inputRef.current) return;
    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => window.clearTimeout(timeoutId);
  }, [notificationsState, inputRef]);
}

function useAutoOpen(
  autoOpen: boolean,
  notificationsEnabled: boolean,
  notificationsState: string,
  openSubscription: () => void
) {
  useEffect(() => {
    if (autoOpen && notificationsEnabled && notificationsState === 'idle') {
      openSubscription();
    }
  }, [autoOpen, notificationsEnabled, notificationsState, openSubscription]);
}

function useImpressionTracking(
  showsSubscribeForm: boolean,
  handle: string,
  variant: string
) {
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  useEffect(() => {
    setHasTrackedImpression(false);
  }, [handle, variant]);
  useEffect(() => {
    if (!showsSubscribeForm || hasTrackedImpression) return;
    track('subscribe_impression', {
      handle,
      placement: 'profile_inline',
      variant,
    });
    setHasTrackedImpression(true);
  }, [showsSubscribeForm, hasTrackedImpression, handle, variant]);
}

/**
 * Get input configuration based on channel type.
 */
function getInputConfig(channel: 'email' | 'sms') {
  return channel === 'sms'
    ? {
        type: 'tel' as const,
        inputMode: 'numeric' as const,
        placeholder: '(555) 123-4567',
        autoComplete: 'tel-national',
        maxLength: 32,
        label: 'Phone number',
      }
    : {
        type: 'email' as const,
        inputMode: 'email' as const,
        placeholder: 'your@email.com',
        autoComplete: 'email',
        maxLength: 254,
        label: 'Email address',
      };
}

/**
 * Get display value for input based on channel.
 */
function getInputDisplayValue(
  channel: 'email' | 'sms',
  phoneInput: string,
  emailInput: string,
  dialCode: string
): string {
  return channel === 'sms'
    ? formatPhoneDigitsForDisplay(phoneInput, dialCode)
    : emailInput;
}

export function ArtistNotificationsCTA({
  artist,
  variant = 'link',
  autoOpen = false,
}: ArtistNotificationsCTAProps) {
  const {
    country,
    setCountry,
    phoneInput,
    emailInput,
    error,
    isSubmitting,
    isCountryOpen,
    setIsCountryOpen,
    handleChannelChange,
    handlePhoneChange,
    handleEmailChange,
    handleFieldBlur,
    handleSubscribe,
    handleKeyDown,
    notificationsState,
    notificationsEnabled,
    channel,
    subscribedChannels,
    openSubscription,
    registerInputFocus,
    hydrationStatus,
  } = useSubscriptionForm({ artist });

  const inputId = useId();
  const disclaimerId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  useInputFocusRegistration(inputRef, registerInputFocus);
  usePhoneInputConstraint(country.dialCode, phoneInput, handlePhoneChange);
  useAutoFocusOnEdit(notificationsState, inputRef);
  useAutoOpen(
    autoOpen,
    notificationsEnabled,
    notificationsState,
    openSubscription
  );

  const showsSubscribeForm =
    notificationsEnabled &&
    !(notificationsState === 'idle' && !autoOpen) &&
    notificationsState !== 'success';
  useImpressionTracking(showsSubscribeForm, artist.handle, variant);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;
  const shouldShowCountrySelector = channel === 'sms' && phoneInput.length > 0;

  // Show loading skeleton while checking subscription status
  if (hydrationStatus === 'checking') {
    return <SubscriptionFormSkeleton />;
  }

  if (!notificationsEnabled || (notificationsState === 'idle' && !autoOpen)) {
    return <ListenNowCTA variant={variant} handle={artist.handle} />;
  }

  if (isSubscribed) {
    return <SubscriptionSuccess />;
  }

  const inputConfig = getInputConfig(channel);
  const inputValue = getInputDisplayValue(
    channel,
    phoneInput,
    emailInput,
    country.dialCode
  );

  const handleInputChange = (value: string) => {
    if (channel === 'sms') {
      handlePhoneChange(value);
    } else {
      handleEmailChange(value);
    }
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
    handleFieldBlur();
  };

  return (
    <div className='space-y-3'>
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
            <ChannelToggle
              channel={channel}
              isSubmitting={isSubmitting}
              onChannelChange={handleChannelChange}
            />
          )}

          <div className='flex-1 min-w-0'>
            <label htmlFor={inputId} className='sr-only'>
              {inputConfig.label}
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
              onChange={event => handleInputChange(event.target.value)}
              onFocus={() => setIsInputFocused(true)}
              onBlur={handleInputBlur}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              autoComplete={inputConfig.autoComplete}
              maxLength={inputConfig.maxLength}
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
        {isSubmitting ? 'Subscribing…' : 'Subscribe'}
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

        {/* Error tooltip - no layout shift, shows inline icon with tooltip */}
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
  );
}
