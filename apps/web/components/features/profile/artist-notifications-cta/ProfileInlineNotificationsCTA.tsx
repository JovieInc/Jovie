'use client';

import { Bell, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProfileNotifications } from '@/components/organisms/profile-shell/ProfileNotificationsContext';
import { useUserSafe } from '@/hooks/useClerkSafe';
import { track } from '@/lib/analytics';
import { readArtistEmailReadyFromSettings } from '@/lib/notifications/artist-email';
import { normalizeSubscriptionEmail } from '@/lib/notifications/validation';
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
  profileHeroMorphPillClassName,
  subscriptionPrimaryActionClassName,
  subscriptionPrimaryLinkClassName,
} from './shared';
import type { NotificationSource } from './types';
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
  readonly source?: NotificationSource;
}

const EMPTY_ALERT_PREFS: Record<NotificationContentType, boolean> = {
  newMusic: false,
  tourDates: false,
  merch: false,
  general: false,
};

function birthdayDigitsToStorage(digits: string): string {
  const mm = digits.slice(0, 2);
  const dd = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  return `${yyyy}-${mm}-${dd}`;
}

function getTriggerClassName(
  variant: ProfileInlineNotificationsCTAProps['variant']
) {
  if (variant === 'hero') {
    return `${profileHeroMorphPillClassName} gap-2 px-5`;
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
  source,
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
    handleOtpChange,
    handleSubscribe,
    handleVerifyOtp,
    handleResendOtp,
    notificationsState,
    notificationsEnabled,
    subscribedChannels,
    openSubscription,
    hydrationStatus,
  } = useSubscriptionForm({ artist, source });
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
  const [step, setStep] =
    useState<ProfileMobileNotificationsFlowStep>('preferences');
  const [flowOrigin, setFlowOrigin] = useState<FlowOrigin>(
    isSubscribed ? 'manage' : 'subscribe'
  );
  const [nameInput, setNameInput] = useState('');
  const [birthdayInput, setBirthdayInput] = useState('');
  const [birthdayHintShown, setBirthdayHintShown] = useState(false);
  const [alertPrefs, setAlertPrefs] = useState(EMPTY_ALERT_PREFS);
  const [artistEmailOptIn, setArtistEmailOptIn] = useState(false);
  const [canEditPreferences, setCanEditPreferences] = useState(isSubscribed);
  const subscribedEmailRef = useRef('');
  const hasAutoOpenedRef = useRef(false);

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
  const flowChannel = isSmsOnlyManageFlow ? 'sms' : 'email';
  const showArtistEmailSection = flowChannel === 'email';

  const syncPreferencesFromStatus = useCallback(() => {
    if (isSubscribed) {
      setAlertPrefs({
        ...EMPTY_ALERT_PREFS,
        ...contentPreferences,
      });
      setArtistEmailOptIn(artistEmail?.optedIn ?? false);
      return;
    }

    setAlertPrefs(EMPTY_ALERT_PREFS);
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
      setFlowOrigin('subscribe');
      setCanEditPreferences(false);
      setStep('preferences');
    }

    setIsFlowOpen(true);
    track('subscribe_step_reveal', {
      handle: artist.handle,
      source: source ?? 'profile_inline',
    });
  }, [
    artist.handle,
    handleChannelChange,
    isSubscribed,
    onManageNotifications,
    openSubscription,
    source,
    syncPreferencesFromStatus,
  ]);

  useEffect(() => {
    onRegisterReveal?.(openFlow);
  }, [onRegisterReveal, openFlow]);

  useEffect(() => {
    if (!isFlowOpen) return;
    if (step !== 'email' || emailInput) return;

    const primaryEmail = user?.primaryEmailAddress?.emailAddress ?? '';
    if (primaryEmail) {
      handleEmailChange(primaryEmail);
    }
  }, [emailInput, handleEmailChange, isFlowOpen, step, user]);

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
      step !== 'preferences'
    ) {
      return;
    }

    setFlowOrigin('manage');
    setCanEditPreferences(true);
  }, [autoOpen, isFlowOpen, isInline, isSubscribed, step]);

  const activeEmail = useMemo(
    () =>
      normalizeSubscriptionEmail(subscriptionDetails.email ?? emailInput) ??
      subscribedEmailRef.current,
    [emailInput, subscriptionDetails.email]
  );

  const handleClose = useCallback(() => {
    if (isInline) {
      if (isSubscribed) {
        setFlowOrigin('manage');
        setCanEditPreferences(true);
        setStep('preferences');
      } else {
        setFlowOrigin('subscribe');
        setCanEditPreferences(false);
        setStep('preferences');
      }
      return;
    }
    setIsFlowOpen(false);
    setBirthdayHintShown(false);
    setCanEditPreferences(isSubscribed);
    setFlowOrigin(isSubscribed ? 'manage' : 'subscribe');
    setStep('preferences');
    onFlowClosed?.();
  }, [isInline, isSubscribed, onFlowClosed]);

  const handleBack = useCallback(() => {
    switch (step) {
      case 'email':
        setStep('preferences');
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
      subscribedEmailRef.current =
        normalizeSubscriptionEmail(emailInput) ??
        subscriptionDetails.email ??
        '';
      setStep('name');
    }
  }, [emailInput, handleSubscribe, subscriptionDetails.email]);

  const handleOtpSubmit = useCallback(async () => {
    const result = await handleVerifyOtp();
    if (result !== 'subscribed') return;

    subscribedEmailRef.current =
      normalizeSubscriptionEmail(emailInput) ?? subscriptionDetails.email ?? '';
    setStep('name');
  }, [emailInput, handleVerifyOtp, subscriptionDetails.email]);

  const handleOtpComplete = useCallback(
    async (value: string) => {
      handleOtpChange(value);
      if (value.length !== 6) return;
      const result = await handleVerifyOtp(value);
      if (result !== 'subscribed') return;

      subscribedEmailRef.current =
        normalizeSubscriptionEmail(emailInput) ??
        subscriptionDetails.email ??
        '';
      setStep('name');
    },
    [emailInput, handleOtpChange, handleVerifyOtp, subscriptionDetails.email]
  );

  const handleNameSubmit = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !activeEmail) {
      setStep('birthday');
      return;
    }

    try {
      await nameMutation.mutateAsync({
        artistId: artist.id,
        email: activeEmail,
        name: trimmed,
      });
    } catch {
      // Best-effort, do not block the flow on profile enrichment.
    }

    setStep('birthday');
  }, [activeEmail, artist.id, nameInput, nameMutation]);

  const handleBirthdaySubmit = useCallback(
    async (overrideDigits?: string) => {
      const digits = (overrideDigits ?? birthdayInput).replaceAll(/[^\d]/g, '');

      if (digits.length < 8) {
        if (!birthdayHintShown) {
          setBirthdayHintShown(true);
          return;
        }
        setCanEditPreferences(true);
        setStep('preferences');
        return;
      }

      if (activeEmail) {
        try {
          await birthdayMutation.mutateAsync({
            artistId: artist.id,
            email: activeEmail,
            birthday: birthdayDigitsToStorage(digits),
          });
        } catch {
          // Best-effort, do not block the flow on profile enrichment.
        }
      }

      setCanEditPreferences(true);
      setStep('preferences');
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

    setStep('done');
  }, [
    activeEmail,
    alertPrefs.merch,
    alertPrefs.newMusic,
    alertPrefs.tourDates,
    artist.id,
    artistEmailOptIn,
    canEditPreferences,
    prefsMutation,
    showArtistEmailSection,
    subscriptionDetails.sms,
  ]);

  if (!notificationsEnabled) {
    return null;
  }

  if (hydrationStatus === 'checking') {
    return null;
  }

  const triggerLabel = isSubscribed ? 'Manage Alerts' : 'Turn on alerts';
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
          <CheckCircle2 className='h-4.5 w-4.5' />
        ) : (
          <Bell className='h-4.5 w-4.5' />
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
        step={step}
        accentHex={accentHex}
        portalContainer={portalContainer}
        emailInput={emailInput}
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
        onEmailChange={handleEmailChange}
        onEmailSubmit={handleEmailSubmit}
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
