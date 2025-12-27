'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/ProfileShell';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  getNotificationSubscribeSuccessMessage,
  NOTIFICATION_COPY,
  subscribeToNotifications,
} from '@/lib/notifications/client';
import type { CountryOption } from '@/lib/notifications/countries';
import {
  buildPhoneE164,
  COUNTRY_OPTIONS,
  getMaxNationalDigits,
} from '@/lib/notifications/countries';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import type { NotificationChannel } from '@/types/notifications';

export interface UseNotificationSubscriptionProps {
  artistId: string;
  artistHandle: string;
  autoOpen?: boolean;
}

export interface UseNotificationSubscriptionReturn {
  // State from ProfileShell context
  notificationsState: 'idle' | 'editing' | 'success';
  notificationsEnabled: boolean;
  channel: NotificationChannel;
  subscribedChannels: { email?: boolean; sms?: boolean };

  // Local state
  country: CountryOption;
  phoneInput: string;
  emailInput: string;
  error: string | null;
  isSubmitting: boolean;
  isCountryOpen: boolean;
  hasSubscriptions: boolean;
  isSubscribed: boolean;

  // Refs
  inputRef: React.RefObject<HTMLInputElement>;

  // Handlers
  setCountry: (country: CountryOption) => void;
  setIsCountryOpen: (open: boolean) => void;
  handleChannelChange: (channel: NotificationChannel) => void;
  handlePhoneChange: (value: string) => void;
  handleEmailChange: (value: string) => void;
  handleFieldBlur: () => void;
  handleSubscribe: () => Promise<void>;
  handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
}

export function useNotificationSubscription({
  artistId,
  artistHandle,
  autoOpen = false,
}: UseNotificationSubscriptionProps): UseNotificationSubscriptionReturn {
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

  const inputRef = React.useRef<HTMLInputElement>(null);

  // Limit phone input length based on country
  useEffect(() => {
    const maxNationalDigits = getMaxNationalDigits(country.dialCode);
    setPhoneInput(prev => prev.slice(0, maxNationalDigits));
  }, [country.dialCode]);

  // Auto-focus input when entering editing state
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
      const digitsOnly = value.replace(/[^\d]/g, '');
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
      const digitsOnly = phoneInput.replace(/[^\d]/g, '');

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

    void validateCurrent();
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
        artistId,
        channel,
        email: channel === 'email' ? trimmedEmail : undefined,
        phone: channel === 'sms' ? phoneE164 : undefined,
        countryCode: channel === 'sms' ? country.code : undefined,
        source: 'profile_inline',
      });

      track('notifications_subscribe_success', {
        channel,
        source: 'profile_inline',
        handle: artistHandle,
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
        handle: artistHandle,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isSubmitting,
    channel,
    emailInput,
    phoneInput,
    country,
    artistId,
    artistHandle,
    setSubscribedChannels,
    setSubscriptionDetails,
    setNotificationsState,
    showSuccess,
    showError,
  ]);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;

    if (!validateCurrent()) {
      track('notifications_subscribe_error', {
        error_type: 'validation_error',
        channel,
        source: 'profile_inline',
        handle: artistHandle,
      });
      return;
    }

    track('notifications_subscribe_attempt', {
      channel,
      source: 'profile_inline',
      handle: artistHandle,
    });

    await handleConfirmSubscription();
  }, [
    isSubmitting,
    validateCurrent,
    channel,
    artistHandle,
    handleConfirmSubscription,
  ]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> =
    useCallback(
      event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void handleSubscribe();
        }
      },
      [handleSubscribe]
    );

  return {
    notificationsState,
    notificationsEnabled,
    channel,
    subscribedChannels,
    country,
    phoneInput,
    emailInput,
    error,
    isSubmitting,
    isCountryOpen,
    hasSubscriptions,
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
  };
}
