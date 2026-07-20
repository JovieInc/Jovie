'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import { useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { captureError } from '@/lib/error-tracking';
import type { ProfileAlertOptInVariant } from '@/lib/flags/contracts';
import { readArtistEmailReadyFromSettings } from '@/lib/notifications/artist-email';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
import {
  getCaptureDismissalStatus,
  invalidateCaptureDismissalStatus,
} from '@/lib/profile/capture-dismissal-client';
import { readProfileAccentTheme } from '@/lib/profile/profile-theme';
import {
  useUpdateContentPreferencesMutation,
  useUpdateSubscriberBirthdayMutation,
  useUpdateSubscriberNameMutation,
} from '@/lib/queries/useNotificationStatusQuery';
import type { Artist } from '@/types/db';
import type { NotificationContentType } from '@/types/notifications';
import {
  ProfileMobileNotificationsFlow,
  type ProfileMobileNotificationsFlowStep,
} from './ProfileMobileNotificationsFlow';
import {
  noFontSynthesisStyle,
  profilePrimaryPillClassName,
  subscriptionPrimaryActionClassName,
  subscriptionPrimaryLinkClassName,
} from './shared';
import {
  buildNotificationSourceContext,
  type NotificationSource,
  type NotificationSourceContext,
  resolveNotificationSource,
} from './types';
import { useSubscriptionForm } from './useSubscriptionForm';

type FlowOrigin = 'manage' | 'subscribe';

export interface ProfileInlineNotificationsCTAProps {
  readonly artist: Artist;
  readonly onManageNotifications?: () => void;
  readonly onRegisterReveal?: (reveal: () => void) => void;
  readonly variant?: 'default' | 'hero' | 'button' | 'link';
  readonly presentation?: 'overlay' | 'inline' | 'modal';
  readonly portalContainer?: HTMLElement | null;
  readonly autoOpen?: boolean;
  readonly hideTrigger?: boolean;
  readonly onFlowClosed?: () => void;
  /**
   * Fires whenever the overlay/modal flow opens or closes so host chrome
   * (e.g. the profile surface back button) can yield to the flow's own
   * navigation. Inline presentations never report open.
   */
  readonly onFlowOpenChange?: (open: boolean) => void;
  readonly onSubscriptionActivated?: () => void;
  readonly source?: NotificationSource;
  readonly sourceContext?: NotificationSourceContext;
  readonly triggerLabel?: string;
  readonly experimentVariant?: ProfileAlertOptInVariant;
}

const DEFAULT_ALERT_PREFS: Record<NotificationContentType, boolean> = {
  newMusic: true,
  tourDates: true,
  merch: true,
  general: true,
};

function birthdayDigitsToStorage(digits: string): string {
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

const MAX_BIRTHDAY_AGE_YEARS = 120;
const CAPTURE_SUCCESS_HOLD_MS = 1200;

function maskCapturedContact(value: string, channel: 'email' | 'sms') {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (channel === 'sms') {
    const digits = trimmed.replaceAll(/[^\d]/g, '');
    return digits.length >= 4 ? `••• ${digits.slice(-4)}` : 'Your phone';
  }

  const [local = '', domain = ''] = trimmed.split('@');
  if (!domain) return 'Your email';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${local.length > 2 ? '•••' : '•'}@${domain}`;
}

function isValidBirthdayDigits(digits: string): boolean {
  if (digits.length !== 8) {
    return false;
  }

  const month = Number.parseInt(digits.slice(0, 2), 10);
  const day = Number.parseInt(digits.slice(2, 4), 10);
  const year = Number.parseInt(digits.slice(4, 8), 10);

  if (
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(year)
  ) {
    return false;
  }

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  if (year < 1) return false;

  // Construct a UTC date and verify each component round-trips so that
  // impossible dates like Feb 30 or month 13 are rejected.
  const utcMillis = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utcMillis)) return false;

  const constructed = new Date(utcMillis);
  if (
    constructed.getUTCFullYear() !== year ||
    constructed.getUTCMonth() !== month - 1 ||
    constructed.getUTCDate() !== day
  ) {
    return false;
  }

  const now = Date.now();
  if (utcMillis > now) return false;

  const oldestAllowed = Date.UTC(
    new Date(now).getUTCFullYear() - MAX_BIRTHDAY_AGE_YEARS,
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate()
  );
  if (utcMillis < oldestAllowed) return false;

  return true;
}

function getTriggerClassName(
  variant: ProfileInlineNotificationsCTAProps['variant']
) {
  if (variant === 'hero') {
    return `${profilePrimaryPillClassName} gap-2 px-5`;
  }

  if (variant === 'link') {
    return subscriptionPrimaryLinkClassName;
  }

  return `${subscriptionPrimaryActionClassName} h-12 w-full justify-center gap-2 px-6`;
}

export function ProfileInlineNotificationsCTA({
  artist,
  onManageNotifications,
  onRegisterReveal,
  variant = 'default',
  presentation = 'overlay',
  portalContainer,
  autoOpen = false,
  hideTrigger = false,
  onFlowClosed,
  onFlowOpenChange,
  onSubscriptionActivated,
  source,
  sourceContext,
  triggerLabel: triggerLabelProp,
  experimentVariant,
}: ProfileInlineNotificationsCTAProps) {
  const { contentPreferences, artistEmail, subscriptionDetails } =
    useProfileNotifications();
  const {
    emailInput,
    error,
    otpCode,
    isSubmitting,
    resendCooldownEnd,
    isResending,
    handleChannelChange,
    handleEmailChange,
    handlePhoneChange,
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
    handleResendOtp,
    notificationsState,
    notificationsEnabled,
    subscribedChannels,
    openSubscription,
    hydrationStatus,
    phoneInput,
    country,
    setCountry,
    isCountryOpen,
    setIsCountryOpen,
    channel,
  } = useSubscriptionForm({
    artist,
    source,
    sourceContext,
    experimentVariant,
  });
  const { user } = useUserSafe();
  const nameMutation = useUpdateSubscriberNameMutation();
  const birthdayMutation = useUpdateSubscriberBirthdayMutation();
  const prefsMutation = useUpdateContentPreferencesMutation();
  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;
  const [isFlowOpen, setIsFlowOpen] = useState(
    presentation === 'inline' || autoOpen
  );
  const [step, setStep] = useState<ProfileMobileNotificationsFlowStep>(
    isSubscribed ? 'preferences' : 'email'
  );
  const [flowOrigin, setFlowOrigin] = useState<FlowOrigin>(
    isSubscribed ? 'manage' : 'subscribe'
  );
  const [nameInput, setNameInput] = useState('');
  const [birthdayInput, setBirthdayInput] = useState('');
  const [birthdayHintShown, setBirthdayHintShown] = useState(false);
  const [successContactEcho, setSuccessContactEcho] = useState<string | null>(
    null
  );
  const [captureSuppressed, setCaptureSuppressed] = useState(false);
  const [alertPrefs, setAlertPrefs] = useState<
    Record<NotificationContentType, boolean>
  >(() => {
    // Seed from server preferences when the user is already subscribed at mount,
    // so all three entry points (inline CTA, notifications drawer, subscribe
    // drawer) start from the same canonical state rather than DEFAULT_ALERT_PREFS.
    if (isSubscribed && contentPreferences) {
      return { ...DEFAULT_ALERT_PREFS, ...contentPreferences };
    }
    return DEFAULT_ALERT_PREFS;
  });
  const [artistEmailOptIn, setArtistEmailOptIn] = useState(() =>
    isSubscribed ? (artistEmail?.optedIn ?? false) : false
  );
  const [canEditPreferences, setCanEditPreferences] = useState(isSubscribed);
  const subscribedEmailRef = useRef('');
  const hasAutoOpenedRef = useRef(false);
  const activatedInCurrentFlowRef = useRef(false);
  const otpVerificationInFlightRef = useRef(false);
  const captureSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const previousOtpLengthRef = useRef(otpCode.length);
  const pendingCompletedOtpRef = useRef<string | null>(null);
  const autoSubmittedOtpRef = useRef<string | null>(null);

  const isInline = presentation === 'inline';
  const artistEmailReady = readArtistEmailReadyFromSettings(artist.settings);
  const accentHex =
    readProfileAccentTheme(artist.theme)?.primaryHex ?? '#ed9962';
  const hasEmailContact = Boolean(
    subscriptionDetails.email || emailInput.trim()
  );
  const isSmsOnlyManageFlow = Boolean(
    subscribedChannels.sms &&
      !subscribedChannels.email &&
      subscriptionDetails.sms &&
      !hasEmailContact
  );
  const flowChannel =
    flowOrigin === 'subscribe'
      ? channel === 'sms'
        ? 'sms'
        : 'email'
      : isSmsOnlyManageFlow
        ? 'sms'
        : 'email';
  const showArtistEmailSection = flowChannel === 'email';
  const primaryUserEmail = user?.primaryEmailAddress?.emailAddress ?? '';
  const resolvedSource = resolveNotificationSource(source, sourceContext);
  const analyticsBase = useMemo(
    () =>
      buildNotificationSourceContext(artist, {
        artistId: sourceContext?.artistId,
        profileId: sourceContext?.profileId,
        profileSlug: sourceContext?.profileSlug,
        currentTab: sourceContext?.currentTab ?? 'home',
        ctaLocation: resolvedSource,
        intent: sourceContext?.intent ?? 'general_alerts',
        releaseId: sourceContext?.releaseId,
        eventId: sourceContext?.eventId,
      }),
    [
      artist,
      resolvedSource,
      sourceContext?.artistId,
      sourceContext?.currentTab,
      sourceContext?.eventId,
      sourceContext?.intent,
      sourceContext?.profileId,
      sourceContext?.profileSlug,
      sourceContext?.releaseId,
    ]
  );

  const markSubscriptionActivated = useCallback(() => {
    activatedInCurrentFlowRef.current = true;
    setAlertPrefs(DEFAULT_ALERT_PREFS);
    onSubscriptionActivated?.();
  }, [onSubscriptionActivated]);

  useEffect(() => {
    return () => {
      if (captureSuccessTimerRef.current) {
        clearTimeout(captureSuccessTimerRef.current);
      }
    };
  }, []);

  const syncPreferencesFromStatus = useCallback(() => {
    if (isSubscribed) {
      setAlertPrefs({
        ...DEFAULT_ALERT_PREFS,
        ...contentPreferences,
      });
      setArtistEmailOptIn(artistEmail?.optedIn ?? false);
      return;
    }

    setAlertPrefs(DEFAULT_ALERT_PREFS);
    setArtistEmailOptIn(false);
  }, [artistEmail?.optedIn, contentPreferences, isSubscribed]);

  const openFlow = useCallback(() => {
    handleChannelChange('email');
    openSubscription();
    syncPreferencesFromStatus();

    if (isSubscribed) {
      if (onManageNotifications) {
        onManageNotifications();
        return;
      }
      setFlowOrigin('manage');
      setCanEditPreferences(true);
      setStep('preferences');
    } else {
      if (!emailInput && primaryUserEmail) {
        handleEmailChange(primaryUserEmail);
      }
      setFlowOrigin('subscribe');
      setCanEditPreferences(false);
      setStep('email');
    }

    setIsFlowOpen(true);
    track('alert_cta_click', {
      ...analyticsBase,
      source: resolvedSource,
      alert_opt_in_variant: experimentVariant,
      flow_origin: isSubscribed ? 'manage' : 'subscribe',
    });
    track('alert_signup_start', {
      ...analyticsBase,
      source: resolvedSource,
      alert_opt_in_variant: experimentVariant,
      flow_origin: isSubscribed ? 'manage' : 'subscribe',
    });
    track('subscribe_step_reveal', {
      handle: artist.handle,
      source: resolvedSource,
      alert_opt_in_variant: experimentVariant,
    });
  }, [
    analyticsBase,
    artist.handle,
    emailInput,
    experimentVariant,
    handleChannelChange,
    handleEmailChange,
    isSubscribed,
    onManageNotifications,
    openSubscription,
    primaryUserEmail,
    resolvedSource,
    syncPreferencesFromStatus,
  ]);

  useEffect(() => {
    onRegisterReveal?.(openFlow);
  }, [onRegisterReveal, openFlow]);

  useEffect(() => {
    onFlowOpenChange?.(!isInline && isFlowOpen);
  }, [isFlowOpen, isInline, onFlowOpenChange]);

  useEffect(() => {
    if (isSubscribed) {
      setCaptureSuppressed(false);
      return;
    }

    let isActive = true;
    void getCaptureDismissalStatus(artist.id).then(data => {
      if (isActive) {
        setCaptureSuppressed(Boolean(data?.suppressed));
      }
    });

    return () => {
      isActive = false;
    };
  }, [artist.id, isSubscribed]);

  useEffect(() => {
    if (!isFlowOpen) return;
    if (step !== 'email' || emailInput) return;

    if (primaryUserEmail) {
      handleEmailChange(primaryUserEmail);
    }
  }, [emailInput, handleEmailChange, isFlowOpen, primaryUserEmail, step]);

  useEffect(() => {
    if (!isFlowOpen) return;
    syncPreferencesFromStatus();
  }, [isFlowOpen, syncPreferencesFromStatus]);

  useEffect(() => {
    if (!(autoOpen || isInline) || hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    openFlow();
  }, [autoOpen, isInline, openFlow]);

  useEffect(() => {
    if (
      !(isInline || autoOpen) ||
      !isFlowOpen ||
      !isSubscribed ||
      activatedInCurrentFlowRef.current ||
      (flowOrigin === 'subscribe' &&
        (step === 'otp' ||
          step === 'name' ||
          step === 'birthday' ||
          step === 'done'))
    ) {
      return;
    }

    // Sync server preferences before transitioning to manage mode so that the
    // preferences step shows the actual saved values, not DEFAULT_ALERT_PREFS.
    syncPreferencesFromStatus();
    setFlowOrigin('manage');
    setCanEditPreferences(true);
    setStep('preferences');
  }, [
    autoOpen,
    flowOrigin,
    isFlowOpen,
    isInline,
    isSubscribed,
    step,
    syncPreferencesFromStatus,
  ]);

  const activeEmail = useMemo(
    () =>
      normalizeSubscriptionEmail(subscriptionDetails.email ?? emailInput) ??
      subscribedEmailRef.current,
    [emailInput, subscriptionDetails.email]
  );

  const handleClose = useCallback(() => {
    if (isInline) {
      if (onFlowClosed) {
        onFlowClosed();
        return;
      }

      setFlowOrigin(isSubscribed ? 'manage' : 'subscribe');
      setCanEditPreferences(isSubscribed);
      setStep(isSubscribed ? 'preferences' : 'email');
      return;
    }
    setIsFlowOpen(false);
    setBirthdayHintShown(false);
    setCanEditPreferences(isSubscribed);
    setFlowOrigin(isSubscribed ? 'manage' : 'subscribe');
    setStep(isSubscribed ? 'preferences' : 'email');
    onFlowClosed?.();
  }, [isInline, isSubscribed, onFlowClosed]);

  const handleBack = useCallback(() => {
    switch (step) {
      case 'email':
        handleClose();
        return;
      case 'capture_success':
        return;
      case 'otp':
        setStep('email');
        return;
      case 'name':
        setStep('otp');
        return;
      case 'birthday':
        setStep('name');
        return;
      case 'preferences':
        if (flowOrigin === 'manage' || !canEditPreferences) {
          handleClose();
          return;
        }
        setStep('birthday');
        return;
      case 'done':
        handleClose();
    }
  }, [canEditPreferences, flowOrigin, handleClose, step]);

  const handleEmailSubmit = useCallback(async () => {
    const result = await handleSubscribe();
    if (result === 'pending_confirmation') {
      setStep('otp');
      return;
    }

    if (result === 'subscribed') {
      const captureChannel = channel === 'sms' ? 'sms' : 'email';
      const contactValue =
        captureChannel === 'sms'
          ? phoneInput
          : (normalizeSubscriptionEmail(emailInput) ??
            subscriptionDetails.email ??
            emailInput);
      subscribedEmailRef.current =
        normalizeSubscriptionEmail(emailInput) ??
        subscriptionDetails.email ??
        '';
      markSubscriptionActivated();
      setSuccessContactEcho(maskCapturedContact(contactValue, captureChannel));
      setStep('capture_success');
      if (captureSuccessTimerRef.current) {
        clearTimeout(captureSuccessTimerRef.current);
      }
      captureSuccessTimerRef.current = setTimeout(() => {
        setStep('name');
      }, CAPTURE_SUCCESS_HOLD_MS);
    }
  }, [
    channel,
    emailInput,
    handleSubscribe,
    markSubscriptionActivated,
    phoneInput,
    subscriptionDetails.email,
  ]);

  const handleDismissCapture = useCallback(async () => {
    try {
      const response = await fetch('/api/profile/capture-dismissal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist_id: artist.id,
          source: resolvedSource,
        }),
      });

      if (!response.ok) {
        throw new Error('Capture dismissal failed');
      }

      invalidateCaptureDismissalStatus(artist.id);
      handleClose();
    } catch (error) {
      void captureError('Profile capture dismissal failed', error, {
        artistId: artist.id,
        artistHandle: artist.handle,
      });
    }
  }, [artist.handle, artist.id, handleClose, resolvedSource]);

  const handleOtpSubmit = useCallback(async () => {
    if (otpVerificationInFlightRef.current) return;
    otpVerificationInFlightRef.current = true;

    const result = await handleVerifyOtp().finally(() => {
      otpVerificationInFlightRef.current = false;
    });
    if (result !== 'subscribed') return;

    subscribedEmailRef.current =
      normalizeSubscriptionEmail(emailInput) ?? subscriptionDetails.email ?? '';
    markSubscriptionActivated();
    setStep('name');
  }, [
    emailInput,
    handleVerifyOtp,
    markSubscriptionActivated,
    subscriptionDetails.email,
  ]);

  const handleOtpComplete = useCallback(
    async (value: string) => {
      handleOtpChange(value);
      if (value.length !== 6) return;
      if (otpVerificationInFlightRef.current) return;
      otpVerificationInFlightRef.current = true;

      const result = await handleVerifyOtp(value).finally(() => {
        otpVerificationInFlightRef.current = false;
      });
      if (result !== 'subscribed') return;

      subscribedEmailRef.current =
        normalizeSubscriptionEmail(emailInput) ??
        subscriptionDetails.email ??
        '';
      markSubscriptionActivated();
      setStep('name');
    },
    [
      emailInput,
      handleOtpChange,
      handleVerifyOtp,
      markSubscriptionActivated,
      subscriptionDetails.email,
    ]
  );

  useEffect(() => {
    const previousOtpLength = previousOtpLengthRef.current;
    previousOtpLengthRef.current = otpCode.length;

    if (step !== 'otp') {
      pendingCompletedOtpRef.current = null;
      return;
    }

    if (otpCode.length < 6) {
      pendingCompletedOtpRef.current = null;
      autoSubmittedOtpRef.current = null;
      return;
    }

    if (previousOtpLength < 6) {
      pendingCompletedOtpRef.current = otpCode;
    }

    if (pendingCompletedOtpRef.current !== otpCode) {
      return;
    }

    if (autoSubmittedOtpRef.current === otpCode) {
      return;
    }

    if (isSubmitting || otpVerificationInFlightRef.current) {
      return;
    }

    pendingCompletedOtpRef.current = null;
    autoSubmittedOtpRef.current = otpCode;
    handleOtpSubmit().catch(() => {});
  }, [handleOtpSubmit, isSubmitting, otpCode, step]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameInput.trim();
    setStep('birthday');

    if (!trimmed || !activeEmail) {
      return;
    }

    nameMutation
      .mutateAsync({
        artistId: artist.id,
        email: activeEmail,
        name: trimmed,
      })
      .catch(() => {});
  }, [activeEmail, artist.id, nameInput, nameMutation]);

  const handleBirthdaySubmit = useCallback(
    (overrideDigits?: string) => {
      const digits = (overrideDigits ?? birthdayInput).replaceAll(/[^\d]/g, '');

      if (digits.length < 8) {
        if (!birthdayHintShown) {
          setBirthdayHintShown(true);
          return;
        }
        setCanEditPreferences(true);
        setStep('done');
        return;
      }

      if (!isValidBirthdayDigits(digits)) {
        // Real birthday validation: rejects impossible dates (Feb 30, month 13),
        // future dates, and dates more than 120 years in the past.
        setBirthdayHintShown(true);
        return;
      }

      if (activeEmail) {
        setCanEditPreferences(true);
        setStep('done');

        birthdayMutation
          .mutateAsync({
            artistId: artist.id,
            email: activeEmail,
            birthday: birthdayDigitsToStorage(digits),
          })
          .catch(() => {});
        return;
      }

      setCanEditPreferences(true);
      setStep('done');
    },
    [activeEmail, artist.id, birthdayHintShown, birthdayInput, birthdayMutation]
  );

  const handleTogglePref = useCallback(
    (key: NotificationContentType) => {
      setAlertPrefs(prev => ({ ...prev, [key]: !prev[key] }));

      if (canEditPreferences) {
        return;
      }

      setFlowOrigin('subscribe');
      setStep('email');
    },
    [canEditPreferences]
  );

  const handleArtistEmailToggle = useCallback(
    (value: boolean) => {
      setArtistEmailOptIn(value);

      if (canEditPreferences) {
        return;
      }

      setFlowOrigin('subscribe');
      setStep('email');
    },
    [canEditPreferences]
  );

  const handlePreferencesSubmit = useCallback(async () => {
    if (!canEditPreferences) {
      setFlowOrigin('subscribe');
      setStep('email');
      return;
    }

    const email = activeEmail;
    const phone = subscriptionDetails.sms;

    if (email || phone) {
      try {
        await prefsMutation.mutateAsync({
          artistId: artist.id,
          email: email || undefined,
          phone: phone || undefined,
          preferences: {
            newMusic: alertPrefs.newMusic,
            tourDates: alertPrefs.tourDates,
            merch: alertPrefs.merch,
          },
          artistEmailOptIn:
            showArtistEmailSection && email ? artistEmailOptIn : undefined,
        });
      } catch {
        // Keep the flow moving. Status will reconcile on the next fetch.
      }
    }

    const selectedAlertToggles = Object.entries(alertPrefs)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    track('alert_signup_complete', {
      ...analyticsBase,
      source: resolvedSource,
      alert_opt_in_variant: experimentVariant,
      selected_alert_toggles: selectedAlertToggles,
      artist_email_opt_in: artistEmailOptIn,
      signup_completion_result: 'success',
    });

    setStep('done');
  }, [
    activeEmail,
    alertPrefs,
    analyticsBase,
    artist.id,
    artistEmailOptIn,
    canEditPreferences,
    experimentVariant,
    prefsMutation,
    resolvedSource,
    showArtistEmailSection,
    subscriptionDetails.sms,
  ]);

  useEffect(() => {
    if (step !== 'done' || flowOrigin !== 'subscribe') return;

    const closeTimer = window.setTimeout(handleClose, 1400);
    return () => window.clearTimeout(closeTimer);
  }, [flowOrigin, handleClose, step]);

  if (!notificationsEnabled) {
    return null;
  }

  if (hydrationStatus === 'checking') {
    return null;
  }

  if (!isSubscribed && captureSuppressed) {
    return null;
  }

  const triggerLabel = isSubscribed
    ? 'Manage alerts'
    : (triggerLabelProp ?? 'Get alerts');
  const triggerClassName = getTriggerClassName(variant);
  const trigger =
    isInline || hideTrigger ? null : (
      <button
        type='button'
        onClick={openFlow}
        className={triggerClassName}
        style={noFontSynthesisStyle}
        data-testid='profile-inline-notifications-trigger'
      >
        {isSubscribed ? (
          <CheckCircle2 className='size-4.5' />
        ) : (
          <Bell className='size-4.5' />
        )}
        <span>{triggerLabel}</span>
      </button>
    );

  return (
    <>
      {trigger}
      <ProfileMobileNotificationsFlow
        open={isInline || isFlowOpen}
        presentation={isInline ? 'inline' : presentation}
        artistName={artist.name}
        channel={flowChannel}
        country={country}
        step={step}
        accentHex={accentHex}
        portalContainer={portalContainer}
        emailInput={emailInput}
        phoneInput={phoneInput}
        successContactEcho={successContactEcho}
        otpCode={otpCode}
        nameInput={nameInput}
        birthdayInput={birthdayInput}
        error={error}
        isSubmitting={isSubmitting}
        isNameSaving={nameMutation.isPending}
        isBirthdaySaving={birthdayMutation.isPending}
        isPreferencesSaving={prefsMutation.isPending}
        birthdayHintShown={birthdayHintShown}
        resendCooldownEnd={resendCooldownEnd}
        isResending={isResending}
        isCountryOpen={isCountryOpen}
        contentPrefs={alertPrefs}
        canEditPreferences={canEditPreferences}
        canGoBackFromPreferences={
          step !== 'preferences' ||
          (flowOrigin === 'subscribe' && canEditPreferences)
        }
        artistEmailOptIn={artistEmailOptIn}
        artistEmailReady={artistEmailReady}
        showArtistEmailSection={showArtistEmailSection}
        onClose={handleClose}
        onBack={handleBack}
        onChannelChange={handleChannelChange}
        onCountryOpenChange={setIsCountryOpen}
        onCountrySelect={setCountry}
        onEmailChange={handleEmailChange}
        onPhoneChange={handlePhoneChange}
        onEmailSubmit={handleEmailSubmit}
        onDismissCapture={handleDismissCapture}
        onOtpChange={handleOtpChange}
        onOtpComplete={handleOtpComplete}
        onOtpSubmit={handleOtpSubmit}
        onResendOtp={() => {
          void handleResendOtp();
        }}
        onNameChange={setNameInput}
        onNameSubmit={handleNameSubmit}
        onBirthdayChange={value => {
          setBirthdayInput(value);
          if (birthdayHintShown) {
            setBirthdayHintShown(false);
          }
        }}
        onBirthdaySubmit={handleBirthdaySubmit}
        onTogglePref={handleTogglePref}
        onArtistEmailToggle={handleArtistEmailToggle}
        onPreferencesSubmit={handlePreferencesSubmit}
      />
    </>
  );
}
