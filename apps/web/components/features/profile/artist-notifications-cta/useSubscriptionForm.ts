'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import {
  COUNTRY_OPTIONS,
  type CountryOption,
} from '@/features/profile/notifications';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  getNotificationSubscribeSuccessMessage,
  NOTIFICATION_COPY,
} from '@/lib/notifications/client';
import {
  normalizeSubscriptionEmail,
  normalizeSubscriptionPhone,
} from '@/lib/notifications/validation';
import {
  useSubscribeNotificationsMutation,
  useVerifyEmailOtpMutation,
} from '@/lib/queries/useNotificationStatusQuery';
import type { Artist } from '@/types/db';
import type { NotificationChannel } from '@/types/notifications';
import type { NotificationSource } from './types';
import { buildPhoneE164, getMaxNationalDigits } from './utils';

interface UseSubscriptionFormOptions {
  artist: Artist;
  source?: NotificationSource;
}

export type SubscriptionErrorOrigin =
  | 'blur'
  | 'submit'
  | 'verify'
  | 'resend'
  | null;

interface UseSubscriptionFormReturn {
  // State
  country: CountryOption;
  setCountry: (country: CountryOption) => void;
  phoneInput: string;
  emailInput: string;
  error: string | null;
  errorOrigin: SubscriptionErrorOrigin;
  otpCode: string;
  otpStep: 'input' | 'verify';
  isSubmitting: boolean;
  isCountryOpen: boolean;
  setIsCountryOpen: (open: boolean) => void;
  resendCooldownEnd: number;
  isResending: boolean;

  // Handlers
  handleChannelChange: (next: NotificationChannel) => void;
  handlePhoneChange: (value: string) => void;
  handleEmailChange: (value: string) => void;
  handleFieldBlur: () => void;
  handleOtpChange: (value: string) => void;
  handleSubscribe: () => Promise<void>;
  handleVerifyOtp: () => Promise<void>;
  handleResendOtp: () => Promise<boolean>;
  handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;

  // From profile notifications context
  notificationsState: string;
  notificationsEnabled: boolean;
  channel: NotificationChannel;
  subscribedChannels: Partial<Record<NotificationChannel, boolean>>;
  openSubscription: () => void;
  registerInputFocus: (focusFn: (() => void) | null) => void;
  hydrationStatus: 'idle' | 'checking' | 'done';
  smsEnabled: boolean;
}

const OTP_RESEND_COOLDOWN_MS = 30_000;

const resolveInlineErrorMessage = (
  error: unknown,
  fallbackMessage: string
): string => {
  if (!(error instanceof Error) || !error.message.trim()) {
    return fallbackMessage;
  }

  return error.message === 'Server error' ? fallbackMessage : error.message;
};

export function useSubscriptionForm({
  artist,
  source: sourceProp,
}: UseSubscriptionFormOptions): UseSubscriptionFormReturn {
  const source = sourceProp ?? 'profile_inline';
  const {
    state: notificationsState,
    setState: setNotificationsState,
    hydrationStatus,
    notificationsEnabled,
    channel,
    setChannel,
    subscribedChannels,
    setSubscribedChannels,
    setSubscriptionDetails,
    openSubscription,
    registerInputFocus,
    smsEnabled,
  } = useProfileNotifications();

  const [country, setCountry] = useState<CountryOption>(COUNTRY_OPTIONS[0]);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [emailInput, setEmailInput] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [errorOrigin, setErrorOrigin] = useState<SubscriptionErrorOrigin>(null);
  const [otpCode, setOtpCode] = useState<string>('');
  const [otpStep, setOtpStep] = useState<'input' | 'verify'>('input');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCountryOpen, setIsCountryOpen] = useState<boolean>(false);
  const [resendCooldownEnd, setResendCooldownEnd] = useState<number>(0);
  const [isResending, setIsResending] = useState<boolean>(false);
  const otpClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { success: showSuccess } = useNotifications();
  const subscribeMutation = useSubscribeNotificationsMutation();
  const verifyEmailOtpMutation = useVerifyEmailOtpMutation();

  const clearError = useCallback(() => {
    setError(null);
    setErrorOrigin(null);
  }, []);

  const updateError = useCallback(
    (message: string | null, origin: SubscriptionErrorOrigin) => {
      setError(message);
      setErrorOrigin(message ? origin : null);
    },
    []
  );

  const handleChannelChange = useCallback(
    (next: NotificationChannel) => {
      if (isSubmitting) return;
      setChannel(next);
      clearError();
      setOtpStep('input');
      setOtpCode('');
      setResendCooldownEnd(0);
      if (next === 'email') {
        setPhoneInput('');
      } else {
        setEmailInput('');
      }
    },
    [clearError, isSubmitting, setChannel]
  );

  const handlePhoneChange = useCallback(
    (value: string) => {
      const digitsOnly = value.replaceAll(/[^\d]/g, '');
      const maxNationalDigits = getMaxNationalDigits(country.dialCode);
      setPhoneInput(digitsOnly.slice(0, maxNationalDigits));
      if (error) clearError();
    },
    [clearError, country.dialCode, error]
  );

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmailInput(value);
      if (otpStep !== 'input') setOtpStep('input');
      if (otpCode) setOtpCode('');
      setResendCooldownEnd(0);
      if (error) clearError();
    },
    [clearError, error, otpCode, otpStep]
  );

  const validateCurrent = useCallback(
    (origin: 'blur' | 'submit'): boolean => {
      if (channel === 'sms') {
        const digitsOnly = phoneInput.replaceAll(/[^\d]/g, '');

        if (!digitsOnly) {
          updateError('Phone number is required', origin);
          return false;
        }

        const maxNationalDigits = getMaxNationalDigits(country.dialCode);

        if (digitsOnly.length > maxNationalDigits) {
          updateError('Phone number is too long', origin);
          return false;
        }

        const normalizedPhone = normalizeSubscriptionPhone(
          buildPhoneE164(phoneInput, country.dialCode)
        );
        if (!normalizedPhone) {
          updateError('Please enter a valid phone number', origin);
          return false;
        }

        clearError();
        return true;
      }

      const trimmedEmail = emailInput.trim();
      if (!trimmedEmail) {
        updateError('Email address is required', origin);
        return false;
      }

      if (!normalizeSubscriptionEmail(trimmedEmail)) {
        updateError('Please enter a valid email address', origin);
        return false;
      }

      clearError();
      return true;
    },
    [channel, clearError, country.dialCode, emailInput, phoneInput, updateError]
  );

  const handleFieldBlur = useCallback(() => {
    if (channel === 'sms' && !phoneInput.trim()) {
      clearError();
      return;
    }

    if (channel === 'email' && !emailInput.trim()) {
      clearError();
      return;
    }

    validateCurrent('blur');
  }, [channel, clearError, phoneInput, emailInput, validateCurrent]);

  const handleConfirmSubscription = useCallback(async (): Promise<boolean> => {
    if (isSubmitting) return false;

    setIsSubmitting(true);
    clearError();

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

      const response = await subscribeMutation.mutateAsync({
        artistId: artist.id,
        channel,
        email: channel === 'email' ? trimmedEmail : undefined,
        phone: channel === 'sms' ? phoneE164 : undefined,
        countryCode: channel === 'sms' ? country.code : undefined,
        source,
      });

      track('notifications_subscribe_success', {
        channel,
        source,
        handle: artist.handle,
        pending_confirmation: response.pendingConfirmation ?? false,
      });

      if (response.pendingConfirmation) {
        // Double opt-in: show pending confirmation state
        setNotificationsState('pending_confirmation');
        setOtpStep('verify');
        setResendCooldownEnd(Date.now() + OTP_RESEND_COOLDOWN_MS);
        showSuccess('Enter the 6-digit code we sent to your email.');
      } else {
        // Single opt-in: immediate success
        setSubscribedChannels(prev => ({ ...prev, [channel]: true }));

        setSubscriptionDetails(prev => ({
          ...prev,
          [channel]:
            channel === 'sms' ? (phoneE164 ?? '') : (trimmedEmail ?? ''),
        }));

        setNotificationsState('success');
        showSuccess(getNotificationSubscribeSuccessMessage(channel));
      }
      return true;
    } catch (err) {
      updateError(
        resolveInlineErrorMessage(err, NOTIFICATION_COPY.errors.subscribe),
        'submit'
      );

      // Track error in Sentry for monitoring
      void captureError('Notification subscription failed', err, {
        artistId: artist.id,
        artistHandle: artist.handle,
        channel,
        source,
      });

      track('notifications_subscribe_error', {
        error_type: 'submission_error',
        channel,
        source,
        handle: artist.handle,
      });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    artist.handle,
    artist.id,
    channel,
    clearError,
    country.code,
    country.dialCode,
    emailInput,
    isSubmitting,
    phoneInput,
    source,
    subscribeMutation,
    setNotificationsState,
    setSubscribedChannels,
    setSubscriptionDetails,
    showSuccess,
    updateError,
  ]);

  const handleOtpChange = useCallback(
    (value: string) => {
      // Cancel any pending auto-clear timer so fresh input isn't wiped
      if (otpClearTimerRef.current) {
        clearTimeout(otpClearTimerRef.current);
        otpClearTimerRef.current = null;
      }
      setOtpCode(value.replaceAll(/[^\d]/g, '').slice(0, 6));
      if (error) clearError();
    },
    [clearError, error]
  );

  const handleVerifyOtp = useCallback(async () => {
    if (isSubmitting) return;
    if (otpCode.length !== 6) {
      updateError('Enter the 6-digit code from your email', 'verify');
      return;
    }

    setIsSubmitting(true);
    clearError();

    try {
      const normalizedEmail = normalizeSubscriptionEmail(emailInput);
      if (!normalizedEmail)
        throw new Error('Please enter a valid email address');

      await verifyEmailOtpMutation.mutateAsync({
        artistId: artist.id,
        email: normalizedEmail,
        otpCode,
      });

      setSubscribedChannels(prev => ({ ...prev, email: true }));
      setSubscriptionDetails(prev => ({ ...prev, email: normalizedEmail }));
      setNotificationsState('success');
      showSuccess("You're all set. We'll keep you in the loop.");
    } catch (err) {
      updateError(
        resolveInlineErrorMessage(err, NOTIFICATION_COPY.errors.generic),
        'verify'
      );
    } finally {
      setIsSubmitting(false);
    }
  }, [
    artist.id,
    clearError,
    emailInput,
    isSubmitting,
    otpCode,
    setNotificationsState,
    setSubscribedChannels,
    setSubscriptionDetails,
    showSuccess,
    updateError,
    verifyEmailOtpMutation,
  ]);

  const handleResendOtp = useCallback(async () => {
    if (isResending || Date.now() < resendCooldownEnd) {
      return false;
    }

    setIsResending(true);
    clearError();

    track('otp_resend_attempt', {
      source,
      handle: artist.handle,
    });

    const success = await handleConfirmSubscription();

    if (success) {
      track('otp_resend_success', {
        source,
        handle: artist.handle,
      });

      setOtpCode('');
      setResendCooldownEnd(Date.now() + OTP_RESEND_COOLDOWN_MS);
    } else {
      updateError('Failed to resend code. Please try again.', 'resend');
    }

    setIsResending(false);
    return success;
  }, [
    artist.handle,
    clearError,
    handleConfirmSubscription,
    isResending,
    resendCooldownEnd,
    source,
    updateError,
  ]);

  // Clean up OTP auto-clear timer on unmount
  useEffect(() => {
    return () => {
      if (otpClearTimerRef.current) clearTimeout(otpClearTimerRef.current);
    };
  }, []);

  const handleSubscribe = useCallback(async () => {
    if (isSubmitting) return;

    // Track button click intent (before validation)
    track('subscribe_click', {
      channel,
      source,
      handle: artist.handle,
    });

    if (!validateCurrent('submit')) {
      track('notifications_subscribe_error', {
        error_type: 'validation_error',
        channel,
        source,
        handle: artist.handle,
      });
      return;
    }

    track('notifications_subscribe_attempt', {
      channel,
      source,
      handle: artist.handle,
    });

    await handleConfirmSubscription();
  }, [
    artist.handle,
    channel,
    handleConfirmSubscription,
    isSubmitting,
    source,
    validateCurrent,
  ]);

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> =
    useCallback(
      event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          otpStep === 'verify' ? handleVerifyOtp() : handleSubscribe();
        }
      },
      [handleSubscribe, handleVerifyOtp, otpStep]
    );

  return {
    country,
    setCountry,
    phoneInput,
    emailInput,
    error,
    errorOrigin,
    otpCode,
    otpStep,
    isSubmitting,
    isCountryOpen,
    setIsCountryOpen,
    resendCooldownEnd,
    isResending,
    handleChannelChange,
    handlePhoneChange,
    handleEmailChange,
    handleFieldBlur,
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
    handleResendOtp,
    handleKeyDown,
    notificationsState,
    notificationsEnabled,
    channel,
    subscribedChannels,
    openSubscription,
    registerInputFocus,
    hydrationStatus,
    smsEnabled,
  };
}
