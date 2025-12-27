'use client';

import Link from 'next/link';
import { SubscriptionSuccess } from '@/components/profile/atoms/SubscriptionSuccess';
import { useNotificationSubscription } from '@/components/profile/hooks/useNotificationSubscription';
import { NotificationChannelInput } from '@/components/profile/molecules/NotificationChannelInput';
import { CTAButton } from '@/components/ui/CTAButton';
import type { Artist } from '@/types/db';

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
    notificationsState,
    notificationsEnabled,
    channel,
    country,
    phoneInput,
    emailInput,
    error,
    isSubmitting,
    isCountryOpen,
    isSubscribed,
    inputRef,
    setCountry,
    setIsCountryOpen,
    handleChannelChange,
    handlePhoneChange,
    handleEmailChange,
    handleFieldBlur,
    handleSubscribe,
    handleKeyDown,
  } = useNotificationSubscription({
    artistId: artist.id,
    artistHandle: artist.handle,
    autoOpen,
  });

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
    return <SubscriptionSuccess />;
  }

  return (
    <>
      <div className='space-y-3'>
        {/* Input container - Geist style */}
        <NotificationChannelInput
          channel={channel}
          country={country}
          phoneInput={phoneInput}
          emailInput={emailInput}
          isCountryOpen={isCountryOpen}
          isSubmitting={isSubmitting}
          inputRef={inputRef}
          onChannelChange={handleChannelChange}
          onCountryChange={setCountry}
          onCountryOpenChange={setIsCountryOpen}
          onPhoneChange={handlePhoneChange}
          onEmailChange={handleEmailChange}
          onBlur={handleFieldBlur}
          onKeyDown={handleKeyDown}
        />

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
