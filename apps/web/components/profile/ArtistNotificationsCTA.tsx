'use client';

import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useId, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/ProfileShell';
import {
  COUNTRY_OPTIONS,
  type CountryOption,
  CountrySelector,
} from '@/components/profile/notifications';
import { CTAButton } from '@/components/ui/CTAButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  getNotificationSubscribeSuccessMessage,
  NOTIFICATION_COPY,
  subscribeToNotifications,
} from '@/lib/notifications/client';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import type { Artist } from '@/types/db';
import type { NotificationChannel } from '@/types/notifications';

function formatPhoneDigitsForDisplay(digits: string, dialCode: string): string {
  const normalized = digits.replace(/\D/g, '');
  if (!normalized) return '';

  if (dialCode === '+1') {
    const part1 = normalized.slice(0, 3);
    const part2 = normalized.slice(3, 6);
    const part3 = normalized.slice(6, 10);
    const rest = normalized.slice(10);

    if (normalized.length <= 3) return `(${part1}`;
    if (normalized.length <= 6) return `(${part1}) ${part2}`;
    if (normalized.length <= 10) return `(${part1}) ${part2}-${part3}`;

    return `(${part1}) ${part2}-${part3} ${rest}`.trim();
  }

  const grouped = normalized.match(/.{1,3}/g);
  return grouped ? grouped.join(' ') : normalized;
}

interface ArtistNotificationsCTAProps {
  artist: Artist;
  /**
   * Controls the base rendering style when notifications are disabled or idle.
   * "link" matches the static profile button, "button" matches CTAButton.
   */
  variant?: 'link' | 'button';
  /**
   * When true, automatically opens the subscription form on mount.
   * Used for /handle/subscribe route.
   */
  autoOpen?: boolean;
}

export function ArtistNotificationsCTA({
  artist,
  variant = 'link',
  autoOpen = false,
}: ArtistNotificationsCTAProps) {
  const {
    state: notificationsState,
    setState: setNotificationsState,
    notificationsEnabled,
    channel,
    setChannel,
    subscribedChannels,
    setSubscribedChannels,
    setSubscriptionDetails,
    openSubscription,
  } = useProfileNotifications();

  const [country, setCountry] = useState<CountryOption>(COUNTRY_OPTIONS[0]);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCountryOpen, setIsCountryOpen] = useState<boolean>(false);

  const { success: showSuccess, error: showError } = useNotifications();

  const inputId = useId();
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dialDigits = country.dialCode.replace(/[^\d]/g, '');
    const maxNationalDigits = Math.max(0, 15 - dialDigits.length);
    setPhoneInput(prev => prev.slice(0, maxNationalDigits));
  }, [country.dialCode]);

  // Auto-focus input when entering editing state
  React.useEffect(() => {
    if (notificationsState === 'editing' && inputRef.current) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }, 100);
    }
  }, [notificationsState]);

  // Auto-open subscription form when autoOpen prop is true
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

  const handleChannelChange = (next: NotificationChannel) => {
    if (isSubmitting) return;
    setChannel(next);
    setError(null);
    // Clear inputs when switching channels to prevent stale data
    if (next === 'email') {
      setPhoneInput('');
    } else {
      setEmailInput('');
    }
  };

  const handlePhoneChange = (value: string) => {
    const digitsOnly = value.replace(/[^\d]/g, '');
    const dialDigits = country.dialCode.replace(/[^\d]/g, '');
    const maxNationalDigits = Math.max(0, 15 - dialDigits.length);

    setPhoneInput(digitsOnly.slice(0, maxNationalDigits));

    if (error) setError(null);
  };

  const handleEmailChange = (value: string) => {
    setEmailInput(value);
    // Clear error when user starts typing
    if (error) setError(null);
  };

  const validateCurrent = (): boolean => {
    if (channel === 'sms') {
      const digitsOnly = phoneInput.replace(/[^\d]/g, '');

      if (!digitsOnly) {
        setError('Phone number is required');
        return false;
      }

      const dialDigits = country.dialCode.replace(/[^\d]/g, '');
      const maxNationalDigits = Math.max(0, 15 - dialDigits.length);

      if (digitsOnly.length > maxNationalDigits) {
        setError('Phone number is too long');
        return false;
      }

      const normalizedPhone = normalizeSubscriptionPhone(buildPhoneE164());
      if (!normalizedPhone) {
        setError('Please enter a valid phone number');
        return false;
      }

      setError(null);
      return true;
    }

    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail) {
      setError('Email address is required');
      return false;
    }

    if (!normalizeSubscriptionEmail(trimmedEmail)) {
      setError('Please enter a valid email address');
      return false;
    }

    setError(null);
    return true;
  };

  const handleFieldBlur = () => {
    if (channel === 'sms' && !phoneInput.trim()) {
      setError(null);
      return;
    }

    if (channel === 'email' && !emailInput.trim()) {
      setError(null);
      return;
    }

    void validateCurrent();
  };

  const handleSubscribe = async () => {
    if (isSubmitting) return;

    if (!validateCurrent()) {
      track('notifications_subscribe_error', {
        error_type: 'validation_error',
        channel,
        source: 'profile_inline',
        handle: artist.handle,
      });
      return;
    }

    track('notifications_subscribe_attempt', {
      channel,
      source: 'profile_inline',
      handle: artist.handle,
    });

    await handleConfirmSubscription();
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubscribe();
    }
  };

  const buildPhoneE164 = (): string => {
    const digitsOnly = phoneInput.replace(/[^\d]/g, '');
    const dialDigits = country.dialCode.replace(/[^\d]/g, '');
    return `+${dialDigits}${digitsOnly}`;
  };

  const handleConfirmSubscription = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedEmail =
        channel === 'email'
          ? (normalizeSubscriptionEmail(emailInput) ?? undefined)
          : undefined;
      const phoneE164 =
        channel === 'sms'
          ? (normalizeSubscriptionPhone(buildPhoneE164()) ?? undefined)
          : undefined;

      if (channel === 'email' && !trimmedEmail) {
        throw new Error('Please enter a valid email address');
      }

      if (channel === 'sms' && !phoneE164) {
        throw new Error('Please enter a valid phone number');
      }

      await subscribeToNotifications({
        artistId: artist.id,
        channel,
        email: channel === 'email' ? trimmedEmail : undefined,
        phone: channel === 'sms' ? phoneE164 : undefined,
        countryCode: channel === 'sms' ? country.code : undefined,
        source: 'profile_inline',
      });

      track('notifications_subscribe_success', {
        channel,
        source: 'profile_inline',
        handle: artist.handle,
      });

      setSubscribedChannels(prev => ({ ...prev, [channel]: true }));

      setSubscriptionDetails(prev => ({
        ...prev,
        [channel]: channel === 'sms' ? (phoneE164 ?? '') : (trimmedEmail ?? ''),
      }));

      setNotificationsState('success');
      showSuccess(getNotificationSubscribeSuccessMessage(channel));
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : NOTIFICATION_COPY.errors.subscribe;
      setError(message);
      showError(NOTIFICATION_COPY.errors.subscribe);

      track('notifications_subscribe_error', {
        error_type: 'submission_error',
        channel,
        source: 'profile_inline',
        handle: artist.handle,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Base CTA when notifications are disabled or the bell has not been used yet.
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
        {/* Input container - Geist style */}
        <div className='rounded-2xl bg-surface-0 backdrop-blur-md ring-1 ring-(--color-border-subtle) shadow-sm focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))] transition-[box-shadow,ring] overflow-hidden'>
          <div className='flex items-center'>
            {/* Country selector for phone */}
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

            {/* Input field */}
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

        {/* Subscribe button - Geist style */}
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

        {/* Error message - below button to prevent layout shift */}
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
