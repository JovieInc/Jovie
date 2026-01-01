'use client';

import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { CountrySelector } from '@/components/profile/notifications';
import { CTAButton } from '@/components/ui/CTAButton';
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
  } = useSubscriptionForm({ artist });

  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

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
        className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl text-white bg-black shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-black dark:bg-white dark:text-black dark:hover:bg-gray-100 dark:focus-visible:ring-white'
      >
        Listen Now
      </Link>
    );
  }

  if (isSubscribed) {
    return (
      <div className='space-y-1'>
        <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-black text-white dark:bg-white dark:text-black shadow-lg shadow-black/10 dark:shadow-white/10 transition-colors duration-200'>
          <svg
            className='w-5 h-5 mr-2 text-yellow-400 dark:text-yellow-300'
            viewBox='0 0 24 24'
            aria-hidden='true'
          >
            <path
              d='M12 2a6 6 0 00-6 6v3.159c0 .538-.214 1.055-.595 1.436L4 15h16l-1.405-1.405A2.032 2.032 0 0118 11.159V8a6 6 0 00-6-6z'
              fill='currentColor'
            />
            <path
              d='M9 18a3 3 0 006 0'
              stroke='currentColor'
              strokeWidth={2}
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          <span className='font-semibold'>Subscribed to notifications</span>
        </div>
        <p className='text-xs text-center text-gray-600 dark:text-gray-400'>
          You&apos;ll now receive updates from this artist. Tap the bell to add
          another channel or unsubscribe.
        </p>
      </div>
    );
  }

  return (
    <>
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
                  className='h-12 pl-4 pr-3 flex items-center bg-transparent text-muted-foreground hover:bg-surface-2 transition-colors focus:outline-none'
                  aria-label='Switch to email updates'
                  onClick={() => handleChannelChange('email')}
                  disabled={isSubmitting}
                >
                  <Mail className='w-4 h-4' aria-hidden='true' />
                </button>
              )
            ) : (
              <button
                type='button'
                className='h-12 pl-4 pr-3 flex items-center bg-transparent text-muted-foreground hover:bg-surface-2 transition-colors focus:outline-none'
                aria-label='Switch to text updates'
                onClick={() => handleChannelChange('sms')}
                disabled={isSubmitting}
              >
                <Phone className='w-4 h-4' aria-hidden='true' />
              </button>
            )}

            <div className='flex-1 min-w-0'>
              <label htmlFor={inputId} className='sr-only'>
                {channel === 'sms' ? 'Phone number' : 'Email address'}
              </label>
              <input
                ref={inputRef}
                id={inputId}
                type={channel === 'sms' ? 'tel' : 'email'}
                inputMode={channel === 'sms' ? 'numeric' : 'email'}
                className='w-full h-12 px-4 bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground placeholder:opacity-80 border-none focus:outline-none focus:ring-0'
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
                onBlur={handleFieldBlur}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                autoComplete={channel === 'sms' ? 'tel-national' : 'email'}
                maxLength={channel === 'sms' ? 32 : 254}
                style={{ fontSynthesisWeight: 'none' }}
              />
            </div>
          </div>
        </div>

        <button
          type='button'
          onClick={() => void handleSubscribe()}
          disabled={isSubmitting}
          className='w-full h-11 inline-flex items-center justify-center rounded-md bg-btn-primary text-btn-primary-foreground text-base font-medium transition-opacity duration-150 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed focus-ring-themed focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
          style={{ fontSynthesisWeight: 'none' }}
        >
          {isSubmitting ? 'Subscribing…' : 'Subscribe'}
        </button>

        <p
          className='text-center text-[11px] leading-4 font-normal tracking-wide text-muted-foreground/80'
          style={{ fontSynthesisWeight: 'none' }}
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
    </>
  );
}
