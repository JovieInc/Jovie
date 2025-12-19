'use client';

import { Popover, PopoverContent, PopoverTrigger } from '@jovie/ui';
import { Check, ChevronDown, Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useId, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/ProfileShell';
import { CTAButton } from '@/components/ui/CTAButton';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import type { Artist } from '@/types/db';
import type { NotificationChannel } from '@/types/notifications';

interface CountryOption {
  code: string;
  dialCode: string;
  flag: string;
  label: string;
}

// Countries supported by Twilio SMS (sorted by usage/popularity)
const COUNTRY_OPTIONS: CountryOption[] = [
  // North America
  { code: 'US', dialCode: '+1', flag: '🇺🇸', label: 'United States' },
  { code: 'CA', dialCode: '+1', flag: '🇨🇦', label: 'Canada' },
  { code: 'MX', dialCode: '+52', flag: '🇲🇽', label: 'Mexico' },
  // Europe
  { code: 'GB', dialCode: '+44', flag: '🇬🇧', label: 'United Kingdom' },
  { code: 'DE', dialCode: '+49', flag: '🇩🇪', label: 'Germany' },
  { code: 'FR', dialCode: '+33', flag: '🇫🇷', label: 'France' },
  { code: 'ES', dialCode: '+34', flag: '🇪🇸', label: 'Spain' },
  { code: 'IT', dialCode: '+39', flag: '🇮🇹', label: 'Italy' },
  { code: 'NL', dialCode: '+31', flag: '🇳🇱', label: 'Netherlands' },
  { code: 'BE', dialCode: '+32', flag: '🇧🇪', label: 'Belgium' },
  { code: 'CH', dialCode: '+41', flag: '🇨🇭', label: 'Switzerland' },
  { code: 'AT', dialCode: '+43', flag: '🇦🇹', label: 'Austria' },
  { code: 'SE', dialCode: '+46', flag: '🇸🇪', label: 'Sweden' },
  { code: 'NO', dialCode: '+47', flag: '🇳🇴', label: 'Norway' },
  { code: 'DK', dialCode: '+45', flag: '🇩🇰', label: 'Denmark' },
  { code: 'FI', dialCode: '+358', flag: '🇫🇮', label: 'Finland' },
  { code: 'IE', dialCode: '+353', flag: '🇮🇪', label: 'Ireland' },
  { code: 'PT', dialCode: '+351', flag: '🇵🇹', label: 'Portugal' },
  { code: 'PL', dialCode: '+48', flag: '🇵🇱', label: 'Poland' },
  { code: 'CZ', dialCode: '+420', flag: '🇨🇿', label: 'Czech Republic' },
  { code: 'GR', dialCode: '+30', flag: '🇬🇷', label: 'Greece' },
  { code: 'RO', dialCode: '+40', flag: '🇷🇴', label: 'Romania' },
  { code: 'HU', dialCode: '+36', flag: '🇭🇺', label: 'Hungary' },
  // Asia Pacific
  { code: 'AU', dialCode: '+61', flag: '🇦🇺', label: 'Australia' },
  { code: 'NZ', dialCode: '+64', flag: '🇳🇿', label: 'New Zealand' },
  { code: 'JP', dialCode: '+81', flag: '🇯🇵', label: 'Japan' },
  { code: 'KR', dialCode: '+82', flag: '🇰🇷', label: 'South Korea' },
  { code: 'SG', dialCode: '+65', flag: '🇸🇬', label: 'Singapore' },
  { code: 'HK', dialCode: '+852', flag: '🇭🇰', label: 'Hong Kong' },
  { code: 'TW', dialCode: '+886', flag: '🇹🇼', label: 'Taiwan' },
  { code: 'MY', dialCode: '+60', flag: '🇲🇾', label: 'Malaysia' },
  { code: 'PH', dialCode: '+63', flag: '🇵🇭', label: 'Philippines' },
  { code: 'TH', dialCode: '+66', flag: '🇹🇭', label: 'Thailand' },
  { code: 'ID', dialCode: '+62', flag: '🇮🇩', label: 'Indonesia' },
  { code: 'VN', dialCode: '+84', flag: '🇻🇳', label: 'Vietnam' },
  { code: 'IN', dialCode: '+91', flag: '🇮🇳', label: 'India' },
  { code: 'PK', dialCode: '+92', flag: '🇵🇰', label: 'Pakistan' },
  // Middle East
  { code: 'IL', dialCode: '+972', flag: '🇮🇱', label: 'Israel' },
  { code: 'AE', dialCode: '+971', flag: '🇦🇪', label: 'United Arab Emirates' },
  { code: 'SA', dialCode: '+966', flag: '🇸🇦', label: 'Saudi Arabia' },
  // South America
  { code: 'BR', dialCode: '+55', flag: '🇧🇷', label: 'Brazil' },
  { code: 'AR', dialCode: '+54', flag: '🇦🇷', label: 'Argentina' },
  { code: 'CL', dialCode: '+56', flag: '🇨🇱', label: 'Chile' },
  { code: 'CO', dialCode: '+57', flag: '🇨🇴', label: 'Colombia' },
  { code: 'PE', dialCode: '+51', flag: '🇵🇪', label: 'Peru' },
  // Africa
  { code: 'ZA', dialCode: '+27', flag: '🇿🇦', label: 'South Africa' },
  { code: 'NG', dialCode: '+234', flag: '🇳🇬', label: 'Nigeria' },
  { code: 'KE', dialCode: '+254', flag: '🇰🇪', label: 'Kenya' },
  { code: 'EG', dialCode: '+20', flag: '🇪🇬', label: 'Egypt' },
];

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
          ? normalizeSubscriptionEmail(emailInput)
          : undefined;
      const phoneE164 =
        channel === 'sms'
          ? normalizeSubscriptionPhone(buildPhoneE164())
          : undefined;

      if (channel === 'email' && !trimmedEmail) {
        throw new Error('Please enter a valid email address');
      }

      if (channel === 'sms' && !phoneE164) {
        throw new Error('Please enter a valid phone number');
      }

      const body: Record<string, unknown> = {
        artist_id: artist.id,
        artist_handle: artist.handle,
        artist_name: artist.name,
        channel,
        source: 'profile_inline',
      };

      if (channel === 'sms') {
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
        [channel]: channel === 'sms' ? (phoneE164 ?? '') : (trimmedEmail ?? ''),
      }));

      setNotificationsState('success');
      showSuccess(
        channel === 'sms'
          ? "You'll receive SMS updates from this artist."
          : "You'll receive email updates from this artist."
      );
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
                <Popover open={isCountryOpen} onOpenChange={setIsCountryOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type='button'
                      className='h-12 pl-4 pr-3 flex items-center gap-1.5 bg-transparent text-[15px] text-foreground hover:bg-surface-2 transition-colors focus:outline-none'
                      style={{ fontSynthesisWeight: 'none' }}
                      aria-label='Select country code'
                    >
                      <span>{country.flag}</span>
                      <span>{country.dialCode}</span>
                      <ChevronDown className='w-3.5 h-3.5 text-muted-foreground' />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align='start'
                    sideOffset={4}
                    className='w-64 p-1 rounded-lg border border-subtle bg-surface-0 shadow-lg'
                  >
                    <div className='max-h-64 overflow-y-auto py-1'>
                      {COUNTRY_OPTIONS.map(option => (
                        <button
                          key={option.code}
                          type='button'
                          onClick={() => {
                            setCountry(option);
                            setIsCountryOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                            country.code === option.code
                              ? 'bg-surface-2 text-foreground'
                              : 'text-foreground hover:bg-surface-1'
                          }`}
                          style={{ fontSynthesisWeight: 'none' }}
                        >
                          <span className='text-base'>{option.flag}</span>
                          <span className='flex-1 text-left'>
                            {option.label}
                          </span>
                          <span className='text-muted-foreground'>
                            {option.dialCode}
                          </span>
                          {country.code === option.code && (
                            <Check className='w-4 h-4 text-foreground' />
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <button
                  type='button'
                  className='h-12 pl-4 pr-3 flex items-center bg-transparent text-muted-foreground hover:bg-surface-2 transition-colors focus:outline-none'
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
                className='h-12 pl-4 pr-3 flex items-center bg-transparent text-muted-foreground hover:bg-surface-2 transition-colors focus:outline-none'
                aria-label='Switch to text updates'
                onClick={() => handleChannelChange('sms')}
                disabled={isSubmitting}
              >
                <Mail className='w-4 h-4' aria-hidden='true' />
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
