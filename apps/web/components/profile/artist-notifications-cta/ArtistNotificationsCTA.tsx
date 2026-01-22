'use client';

import { Bell, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useEffect, useId, useRef, useState } from 'react';

/** Prevents synthetic font weight rendering for better typography */
const noFontSynthesisStyle: CSSProperties = { fontSynthesisWeight: 'none' };

import { CountrySelector } from '@/components/profile/notifications';
import { CTAButton } from '@/components/ui/CTAButton';
import { track } from '@/lib/analytics';
import type { ArtistNotificationsCTAProps } from './types';
import { useSubscriptionForm } from './useSubscriptionForm';
import { formatPhoneDigitsForDisplay, getMaxNationalDigits } from './utils';

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
  } = useSubscriptionForm({ artist });

  const inputId = useId();
  const disclaimerId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Register the input focus function so bell icon click can focus the input
  useEffect(() => {
    registerInputFocus(() => {
      inputRef.current?.focus();
    });
    return () => {
      registerInputFocus(null);
    };
  }, [registerInputFocus]);

  useEffect(() => {
    const maxNationalDigits = getMaxNationalDigits(country.dialCode);
    if (phoneInput.length > maxNationalDigits) {
      handlePhoneChange(phoneInput.slice(0, maxNationalDigits));
    }
  }, [country.dialCode, handlePhoneChange, phoneInput]);

  useEffect(() => {
    if (notificationsState === 'editing' && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
  }, [notificationsState]);

  useEffect(() => {
    if (autoOpen && notificationsEnabled && notificationsState === 'idle') {
      openSubscription();
    }
  }, [autoOpen, notificationsEnabled, notificationsState, openSubscription]);

  // Track subscribe CTA impression when form is shown
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  const showsSubscribeForm =
    notificationsEnabled &&
    !(notificationsState === 'idle' && !autoOpen) &&
    notificationsState !== 'success';

  useEffect(() => {
    if (showsSubscribeForm && !hasTrackedImpression) {
      track('subscribe_impression', {
        handle: artist.handle,
        placement: 'profile_inline',
        variant: variant,
      });
      setHasTrackedImpression(true);
    }
  }, [showsSubscribeForm, hasTrackedImpression, artist.handle, variant]);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;
  const shouldShowCountrySelector = channel === 'sms' && phoneInput.length > 0;

  if (!notificationsEnabled || (notificationsState === 'idle' && !autoOpen)) {
    if (variant === 'button') {
      return (
        <CTAButton
          href={`/${artist.handle}?mode=listen`}
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
        href={`/${artist.handle}?mode=listen`}
        prefetch
        className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl bg-btn-primary text-btn-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:opacity-95 focus-ring-transparent-offset'
      >
        Listen Now
      </Link>
    );
  }

  if (isSubscribed) {
    return (
      <div className='space-y-1'>
        <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-btn-primary text-btn-primary-foreground shadow-lg transition-colors duration-200'>
          <Bell
            className='w-5 h-5 mr-2 text-accent-bright'
            aria-hidden='true'
          />
          <span className='font-semibold'>Subscribed to notifications</span>
        </div>
        <p className='text-xs text-center text-secondary-token'>
          You&apos;ll now receive updates from this artist. Tap the bell to add
          another channel or unsubscribe.
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-3'>
      <div className='rounded-2xl bg-surface-0 backdrop-blur-md ring-1 ring-(--color-border-subtle) shadow-sm focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))] transition-[box-shadow,ring] overflow-hidden'>
        <div className='flex items-center'>
          {channel === 'sms' ? (
            shouldShowCountrySelector ? (
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
                aria-label='Switch to email updates'
                onClick={() => handleChannelChange('email')}
                disabled={isSubmitting}
              >
                <Phone className='w-4 h-4' aria-hidden='true' />
              </button>
            )
          ) : (
            <button
              type='button'
              className='h-12 pl-4 pr-3 flex items-center bg-transparent text-tertiary-token hover:bg-surface-2 transition-colors focus-visible:outline-none'
              aria-label='Switch to text updates'
              onClick={() => handleChannelChange('sms')}
              disabled={isSubmitting}
            >
              <Mail className='w-4 h-4' aria-hidden='true' />
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
              type={channel === 'sms' ? 'tel' : 'email'}
              inputMode={channel === 'sms' ? 'numeric' : 'email'}
              className='w-full h-12 px-4 bg-transparent text-[15px] text-primary-token placeholder:text-tertiary-token placeholder:opacity-80 border-none focus-visible:outline-none focus-visible:ring-0'
              placeholder={
                channel === 'sms' ? '(555) 123-4567' : 'your@email.com'
              }
              value={
                channel === 'sms'
                  ? formatPhoneDigitsForDisplay(phoneInput, country.dialCode)
                  : emailInput
              }
              onChange={event => {
                if (channel === 'sms') {
                  handlePhoneChange(event.target.value);
                } else {
                  handleEmailChange(event.target.value);
                }
              }}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => {
                setIsInputFocused(false);
                handleFieldBlur();
              }}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting}
              autoComplete={channel === 'sms' ? 'tel-national' : 'email'}
              maxLength={channel === 'sms' ? 32 : 254}
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

      <p
        id={disclaimerId}
        className={`text-center text-[11px] leading-4 font-normal tracking-wide text-muted-foreground/80 transition-opacity duration-200 ${
          isInputFocused ? 'opacity-100' : 'opacity-0'
        }`}
        style={noFontSynthesisStyle}
        aria-hidden={!isInputFocused}
      >
        No spam. Opt-out anytime.
      </p>

      <div className='h-5'>
        {error && (
          <p className='text-sm text-red-500 dark:text-red-400' role='alert'>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
