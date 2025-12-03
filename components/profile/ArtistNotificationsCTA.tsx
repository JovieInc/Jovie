'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@jovie/ui';
import Link from 'next/link';
import React, { useEffect, useId, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/ProfileShell';
import { CTAButton } from '@/components/ui/CTAButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { Artist } from '@/types/db';
import type { NotificationChannel } from '@/types/notifications';

interface CountryOption {
  code: string;
  dialCode: string;
  flag: string;
  label: string;
}

const COUNTRY_OPTIONS: CountryOption[] = [
  { code: 'US', dialCode: '+1', flag: '🇺🇸', label: 'United States' },
  { code: 'GB', dialCode: '+44', flag: '🇬🇧', label: 'United Kingdom' },
  { code: 'CA', dialCode: '+1', flag: '🇨🇦', label: 'Canada' },
  { code: 'AU', dialCode: '+61', flag: '🇦🇺', label: 'Australia' },
  { code: 'DE', dialCode: '+49', flag: '🇩🇪', label: 'Germany' },
];

function detectDefaultCountry(): CountryOption {
  if (typeof navigator === 'undefined') {
    return COUNTRY_OPTIONS[0];
  }

  const language =
    navigator.language || (navigator.languages && navigator.languages[0]) || '';
  const upper = language.toUpperCase();

  const matched = COUNTRY_OPTIONS.find(option => upper.endsWith(option.code));
  return matched ?? COUNTRY_OPTIONS[0];
}

interface ArtistNotificationsCTAProps {
  artist: Artist;
  /**
   * Controls the base rendering style when notifications are disabled or idle.
   * "link" matches the static profile button, "button" matches CTAButton.
   */
  variant?: 'link' | 'button';
}

export function ArtistNotificationsCTA({
  artist,
  variant = 'link',
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
  } = useProfileNotifications();

  const [country, setCountry] = useState<CountryOption>(COUNTRY_OPTIONS[0]);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);

  const { success: showSuccess, error: showError } = useNotifications();

  const countrySelectId = useId();
  const inputId = useId();

  useEffect(() => {
    setCountry(detectDefaultCountry());
  }, []);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.phone
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;

  const handleChannelChange = (next: NotificationChannel) => {
    if (isSubmitting) return;
    setChannel(next);
    setError(null);
  };

  const handleCountryChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const next = COUNTRY_OPTIONS.find(
      option => option.code === event.target.value
    );
    if (next) {
      setCountry(next);
    }
  };

  const validateCurrent = (): boolean => {
    if (channel === 'phone') {
      const trimmed = phoneInput.trim();
      if (!trimmed) {
        setError('Please enter your phone number');
        return false;
      }

      const digitsOnly = trimmed.replace(/[^\d]/g, '');
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        setError('Please enter a valid phone number');
        return false;
      }

      setError(null);
      return true;
    }

    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return false;
    }

    setError(null);
    return true;
  };

  const handleFieldBlur = () => {
    if (channel === 'phone' && !phoneInput.trim()) {
      setError(null);
      return;
    }

    if (channel === 'email' && !emailInput.trim()) {
      setError(null);
      return;
    }

    void validateCurrent();
  };

  const openConfirmIfValid = () => {
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

    setIsConfirmOpen(true);
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openConfirmIfValid();
    }
  };

  const buildPhoneE164 = (): string => {
    const digitsOnly = phoneInput.replace(/[^\d]/g, '');
    const dialDigits = country.dialCode.replace(/[^\d]/g, '');
    return `+${dialDigits}${digitsOnly}`;
  };

  const handleConfirmSubscription = async () => {
    if (isSubmitting) return;

    if (!validateCurrent()) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const trimmedEmail = channel === 'email' ? emailInput.trim() : undefined;
      const phoneE164 = channel === 'phone' ? buildPhoneE164() : undefined;

      const body: Record<string, unknown> = {
        artist_id: artist.id,
        artist_handle: artist.handle,
        artist_name: artist.name,
        channel,
        source: 'profile_inline',
      };

      if (channel === 'phone') {
        body.phone = phoneE164;
        body.country_code = country.code;
      } else {
        body.email = trimmedEmail;
      }

      const response = await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to subscribe');
      }

      track('notifications_subscribe_success', {
        channel,
        source: 'profile_inline',
        handle: artist.handle,
      });

      setSubscribedChannels(prev => ({ ...prev, [channel]: true }));

      setSubscriptionDetails(prev => ({
        ...prev,
        [channel]:
          channel === 'phone' ? (phoneE164 ?? '') : (trimmedEmail ?? ''),
      }));

      setNotificationsState('success');
      showSuccess(
        channel === 'phone'
          ? "You'll receive SMS updates from this artist."
          : "You'll receive email updates from this artist."
      );
      setIsConfirmOpen(false);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to subscribe right now.';
      setError(message);
      showError('Unable to turn on notifications right now.');

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
  if (!notificationsEnabled || notificationsState === 'idle') {
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
        className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold text-white bg-black hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-100 rounded-xl transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black dark:focus-visible:ring-white focus-visible:ring-offset-2'
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
      <div className='space-y-2'>
        <div className='inline-flex w-full rounded-xl bg-black text-white dark:bg-white dark:text-black px-4 py-3 shadow-lg shadow-black/10 dark:shadow-white/10 transition-all duration-200 ease-out'>
          <div className='flex w-full items-center gap-3 flex-wrap sm:flex-nowrap'>
            {channel === 'phone' ? (
              <div className='flex items-center'>
                <label htmlFor={countrySelectId} className='sr-only'>
                  Country code
                </label>
                <select
                  id={countrySelectId}
                  value={country.code}
                  onChange={handleCountryChange}
                  className='bg-black/30 dark:bg-black/10 border border-white/20 text-sm rounded-lg px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60'
                >
                  {COUNTRY_OPTIONS.map(option => (
                    <option key={option.code} value={option.code}>
                      {option.flag} {option.dialCode}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className='flex-1 min-w-0'>
              <label htmlFor={inputId} className='sr-only'>
                {channel === 'phone' ? 'Phone number' : 'Email address'}
              </label>
              <input
                id={inputId}
                type={channel === 'phone' ? 'tel' : 'email'}
                className='w-full bg-transparent border-none text-sm sm:text-base placeholder:text-gray-300 dark:placeholder:text-gray-600 focus-visible:outline-none focus-visible:ring-0 focus-visible:border-none'
                placeholder={
                  channel === 'phone'
                    ? 'Enter your phone number'
                    : 'Enter your email'
                }
                value={channel === 'phone' ? phoneInput : emailInput}
                onChange={event => {
                  if (channel === 'phone') {
                    setPhoneInput(event.target.value);
                  } else {
                    setEmailInput(event.target.value);
                  }
                }}
                onBlur={handleFieldBlur}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                autoComplete={channel === 'phone' ? 'tel' : 'email'}
              />
            </div>

            <ContactMethodToggle
              channel={channel}
              onChange={handleChannelChange}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {error ? (
          <p className='text-sm text-red-500 dark:text-red-400' role='alert'>
            {error}
          </p>
        ) : null}

        <div className='flex justify-end'>
          <button
            type='button'
            onClick={openConfirmIfValid}
            disabled={isSubmitting}
            className='inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold bg-white text-black hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-black dark:text-white dark:hover:bg-gray-900 border border-transparent'
          >
            {isSubmitting ? 'Submitting…' : 'Subscribe'}
          </button>
        </div>
      </div>

      <Sheet open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <SheetContent side='bottom'>
          <SheetHeader>
            <SheetTitle>Subscribe to notifications?</SheetTitle>
            <SheetDescription>
              You&apos;ll receive updates from this artist. By subscribing, you
              agree to our{' '}
              <Link href='/terms' className='underline'>
                Terms
              </Link>{' '}
              and{' '}
              <Link href='/privacy' className='underline'>
                Privacy Policy
              </Link>
              .
            </SheetDescription>
          </SheetHeader>

          <SheetFooter className='mt-6'>
            <div className='flex w-full justify-end gap-3'>
              <button
                type='button'
                onClick={() => setIsConfirmOpen(false)}
                disabled={isSubmitting}
                className='inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium border border-gray-300 text-gray-800 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-900'
              >
                Cancel
              </button>
              <button
                type='button'
                onClick={handleConfirmSubscription}
                disabled={isSubmitting}
                className='inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold bg-black text-white hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-gray-100'
              >
                {isSubmitting ? 'Subscribing…' : 'Confirm subscription'}
              </button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

interface ContactMethodToggleProps {
  channel: NotificationChannel;
  onChange: (channel: NotificationChannel) => void;
  disabled?: boolean;
}

function ContactMethodToggle({
  channel,
  onChange,
  disabled,
}: ContactMethodToggleProps) {
  return (
    <div className='inline-flex items-center rounded-full bg-white/10 dark:bg-black/10 p-0.5 text-xs font-medium'>
      <button
        type='button'
        onClick={() => onChange('phone')}
        disabled={disabled}
        className={`px-2 py-1 rounded-full transition-colors ${
          channel === 'phone'
            ? 'bg-white text-black dark:bg-white dark:text-black'
            : 'text-white/80 dark:text-white/70'
        }`}
      >
        Phone
      </button>
      <button
        type='button'
        onClick={() => onChange('email')}
        disabled={disabled}
        className={`px-2 py-1 rounded-full transition-colors ${
          channel === 'email'
            ? 'bg-white text-black dark:bg-white dark:text-black'
            : 'text-white/80 dark:text-white/70'
        }`}
      >
        Email
      </button>
    </div>
  );
}
