'use client';

import { useCallback, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/profile-shell';
import {
  COUNTRY_OPTIONS,
  type CountryOption,
} from '@/components/profile/notifications';
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
import { buildPhoneE164, getMaxNationalDigits } from './utils';

interface UseSubscriptionFormOptions {
  artist: Artist;
}

interface UseSubscriptionFormReturn {
  // State
  country: CountryOption;
  setCountry: (country: CountryOption) => void;
  phoneInput: string;
  emailInput: string;
  error: string | null;
  isSubmitting: boolean;
  isCountryOpen: boolean;
  setIsCountryOpen: (open: boolean) => void;

  // Handlers
  handleChannelChange: (next: NotificationChannel) => void;
  handlePhoneChange: (value: string) => void;
  handleEmailChange: (value: string) => void;
  handleFieldBlur: () => void;
  handleSubscribe: () => Promise<void>;
  handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;

  // From profile notifications context
  notificationsState: string;
  notificationsEnabled: boolean;
  channel: NotificationChannel;
  subscribedChannels: Partial<Record<NotificationChannel, boolean>>;
  openSubscription: () => void;
  registerInputFocus: (focusFn: (() => void) | null) => void;
}

export function useSubscriptionForm({
  artist,
}: UseSubscriptionFormOptions): UseSubscriptionFormReturn {
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
    registerInputFocus,
  } = useProfileNotifications();

  const [country, setCountry] = useState<CountryOption>(COUNTRY_OPTIONS[0]);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCountryOpen, setIsCountryOpen] = useState<boolean>(false);

  const { success: showSuccess, error: showError } = useNotifications();

  const handleChannelChange = useCallback(
    (next: NotificationChannel) => {
      if (isSubmitting) return;
      setChannel(next);
      setError(null);
      if (next === 'email') {
        setPhoneInput('');
      } else {
        setEmailInput('');
      }
    },
    [isSubmitting, setChannel]
  );

  const handlePhoneChange = useCallback(
    (value: string) => {
      const digitsOnly = value.replaceAll(/[^\d]/g, '');
      const maxNationalDigits = getMaxNationalDigits(country.dialCode);
      setPhoneInput(digitsOnly.slice(0, maxNationalDigits));
      if (error) setError(null);
    },
    [country.dialCode, error]
  );

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmailInput(value);
      if (error) setError(null);
    },
    [error]
  );

  const validateCurrent = useCallback((): boolean => {
    if (channel === 'sms') {
      const digitsOnly = phoneInput.replaceAll(/[^\d]/g, '');

      if (!digitsOnly) {
        setError('Phone number is required');
        return false;
      }

      const maxNationalDigits = getMaxNationalDigits(country.dialCode);

      if (digitsOnly.length > maxNationalDigits) {
        setError('Phone number is too long');
        return false;
      }

      const normalizedPhone = normalizeSubscriptionPhone(
        buildPhoneE164(phoneInput, country.dialCode)
      );
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
  }, [channel, phoneInput, emailInput, country.dialCode]);

  const handleFieldBlur = useCallback(() => {
    if (channel === 'sms' && !phoneInput.trim()) {
      setError(null);
      return;
    }

    if (channel === 'email' && !emailInput.trim()) {
      setError(null);
      return;
    }

    validateCurrent();
  }, [channel, phoneInput, emailInput, validateCurrent]);

  const handleConfirmSubscription = useCallback(async () => {
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
          ? (normalizeSubscriptionPhone(
              buildPhoneE164(phoneInput, country.dialCode)
            ) ?? undefined)
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
    } catch (err) {
      const message =
        err instanceof Error ? err.message : NOTIFICATION_COPY.errors.subscribe;
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
  }, [
    artist.handle,
    artist.id,
    channel,
    country.code,
    country.dialCode,
    emailInput,
    isSubmitting,
    phoneInput,
    setNotificationsState,
    setSubscribedChannels,
    setSubscriptionDetails,
    showError,
    showSuccess,
  ]);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;

    // Track button click intent (before validation)
    track('subscribe_click', {
      channel,
      source: 'profile_inline',
      handle: artist.handle,
    });

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
  }, [
    artist.handle,
    channel,
    handleConfirmSubscription,
    isSubmitting,
    validateCurrent,
  ]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> =
    useCallback(
      event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          handleSubscribe().catch(error => {
            console.error('[SubscriptionForm] Subscribe failed:', error);
          });
        }
      },
      [handleSubscribe]
    );

  return {
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
  };
}
