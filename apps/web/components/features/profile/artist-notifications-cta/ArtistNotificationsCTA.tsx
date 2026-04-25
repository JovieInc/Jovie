'use client';

import { Mail, Phone } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { useEffect, useId, useRef, useState } from 'react';
import { OtpInput } from '@/features/auth/atoms/otp-input';
import { CountrySelector } from '@/features/profile/notifications';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  clearOtpConfirmTimeout,
  noFontSynthesisStyle,
  profileQuietIconButtonClassName,
  requestOtpResendConfirmation,
  SubscriptionDesktopErrorIndicator,
  SubscriptionFeedbackRail,
  SubscriptionFormSkeleton,
  SubscriptionOtpResendAction,
  SubscriptionPearlComposer,
  SubscriptionSuccess,
  subscriptionComposerFocusClassName,
  subscriptionHeadingClassName,
  subscriptionInputClassName,
  subscriptionPrimaryActionClassName,
  subscriptionPrimaryLinkClassName,
  subscriptionSuccessTextClassName,
  useSubscriptionErrorFeedback,
} from './shared';
import type { ArtistNotificationsCTAProps } from './types';
import { useSubscriptionForm } from './useSubscriptionForm';
import { formatPhoneDigitsForDisplay, getMaxNationalDigits } from './utils';

/**
 * Listen Now CTA - shown when notifications are disabled or in idle state
 */
function ListenNowCTA({
  variant,
  handle,
}: {
  variant: 'button' | 'link';
  handle: string;
}) {
  const listenHref = `/${handle}?mode=listen`;

  if (variant === 'button') {
    return (
      <Link
        href={listenHref}
        prefetch={false}
        className={subscriptionPrimaryLinkClassName}
      >
        Listen Now
      </Link>
    );
  }

  return (
    <Link
      href={listenHref}
      prefetch={false}
      className={subscriptionPrimaryLinkClassName}
    >
      Listen Now
    </Link>
  );
}

interface ComposerInputContentProps {
  readonly otpStep: string;
  readonly otpCode: string;
  readonly handleOtpChange: (v: string) => void;
  readonly handleVerifyOtp: () => void;
  readonly isSubmitting: boolean;
  readonly error: string | null;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly inputId: string;
  readonly disclaimerId: string;
  readonly inputConfig: ReturnType<typeof getInputConfig>;
  readonly inputValue: string;
  readonly handleInputChange: (v: string) => void;
  readonly handleInputBlur: () => void;
  readonly handleKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  readonly setIsInputFocused: (focused: boolean) => void;
}

function ComposerInputContent({
  otpStep,
  otpCode,
  handleOtpChange,
  handleVerifyOtp,
  isSubmitting,
  error,
  inputRef,
  inputId,
  disclaimerId,
  inputConfig,
  inputValue,
  handleInputChange,
  handleInputBlur,
  handleKeyDown,
  setIsInputFocused,
}: ComposerInputContentProps) {
  if (otpStep === 'verify') {
    return (
      <div className='px-2 py-2'>
        <OtpInput
          value={otpCode}
          onChange={handleOtpChange}
          onComplete={() => {
            if (!error) handleVerifyOtp();
          }}
          autoFocus
          aria-label='Enter 6-digit verification code'
          disabled={isSubmitting}
          error={Boolean(error)}
        />
      </div>
    );
  }
  return (
    <>
      <label htmlFor={inputId} className='sr-only'>
        {inputConfig.label}
      </label>
      <input
        ref={inputRef}
        id={inputId}
        data-testid='subscription-input'
        aria-describedby={disclaimerId}
        type={inputConfig.type}
        inputMode={inputConfig.inputMode}
        className={subscriptionInputClassName}
        placeholder={inputConfig.placeholder}
        value={inputValue}
        onChange={event => handleInputChange(event.target.value)}
        onFocus={() => setIsInputFocused(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleKeyDown}
        disabled={isSubmitting}
        aria-invalid={error ? true : undefined}
        autoComplete={inputConfig.autoComplete}
        maxLength={inputConfig.maxLength}
        style={noFontSynthesisStyle}
      />
    </>
  );
}

interface SubscriberEmailProps {
  readonly channel: 'email' | 'sms';
  readonly emailInput: string;
}

function getSubscriberEmail({
  channel,
  emailInput,
}: SubscriberEmailProps): string | undefined {
  return channel === 'email' ? emailInput.trim() : undefined;
}

interface ChannelToggleProps {
  readonly channel: 'email' | 'sms';
  readonly isSubmitting: boolean;
  readonly onChannelChange: (channel: 'email' | 'sms') => void;
}

/**
 * Channel toggle button (Email <-> SMS)
 */
function ChannelToggle({
  channel,
  isSubmitting,
  onChannelChange,
}: ChannelToggleProps) {
  return (
    <button
      type='button'
      className={`flex h-10 w-10 items-center justify-center rounded-full ${profileQuietIconButtonClassName} transition-colors focus-visible:outline-none`}
      aria-label={
        channel === 'sms' ? 'Switch to email updates' : 'Switch to text updates'
      }
      onClick={() => onChannelChange(channel === 'sms' ? 'email' : 'sms')}
      disabled={isSubmitting}
    >
      {channel === 'sms' ? (
        <Phone className='w-4 h-4' aria-hidden='true' />
      ) : (
        <Mail className='w-4 h-4' aria-hidden='true' />
      )}
    </button>
  );
}

function useInputFocusRegistration(
  inputRef: React.RefObject<HTMLInputElement | null>,
  registerInputFocus: (fn: (() => void) | null) => void
) {
  useEffect(() => {
    registerInputFocus(() => inputRef.current?.focus());
    return () => registerInputFocus(null);
  }, [registerInputFocus, inputRef]);
}

function usePhoneInputConstraint(
  dialCode: string,
  phoneInput: string,
  handlePhoneChange: (value: string) => void
) {
  useEffect(() => {
    const maxNationalDigits = getMaxNationalDigits(dialCode);
    if (phoneInput.length > maxNationalDigits) {
      handlePhoneChange(phoneInput.slice(0, maxNationalDigits));
    }
  }, [dialCode, handlePhoneChange, phoneInput]);
}

function useAutoFocusOnEdit(
  notificationsState: string,
  inputRef: React.RefObject<HTMLInputElement | null>
) {
  useEffect(() => {
    if (notificationsState !== 'editing' || !inputRef.current) return;
    const timeoutId = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 100);
    return () => window.clearTimeout(timeoutId);
  }, [notificationsState, inputRef]);
}

function useAutoOpen(
  autoOpen: boolean,
  notificationsEnabled: boolean,
  notificationsState: string,
  openSubscription: () => void
) {
  useEffect(() => {
    if (autoOpen && notificationsEnabled && notificationsState === 'idle') {
      openSubscription();
    }
  }, [autoOpen, notificationsEnabled, notificationsState, openSubscription]);
}

/**
 * Redirect to normal profile when arriving via subscribe mode but already subscribed.
 */
function useSubscribeModeRedirect(
  autoOpen: boolean,
  isSubscribed: boolean,
  handle: string,
  artistName: string
) {
  const router = useRouter();
  const { info: showInfo } = useNotifications();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!autoOpen || !isSubscribed || hasRedirected.current) return;
    hasRedirected.current = true;
    showInfo(`You're already subscribed to ${artistName}`);
    router.replace(`/${handle}`);
  }, [autoOpen, isSubscribed, handle, artistName, router, showInfo]);
}

function useImpressionTracking(
  showsSubscribeForm: boolean,
  handle: string,
  variant: string
) {
  const [hasTrackedImpression, setHasTrackedImpression] = useState(false);
  useEffect(() => {
    setHasTrackedImpression(false);
  }, [handle, variant]);
  useEffect(() => {
    if (!showsSubscribeForm || hasTrackedImpression) return;
    track('subscribe_impression', {
      handle,
      placement: 'profile_inline',
      variant,
      experiment_group: 'inline',
    });
    setHasTrackedImpression(true);
  }, [showsSubscribeForm, hasTrackedImpression, handle, variant]);
}

/**
 * Get input configuration based on channel type.
 */
function getInputConfig(channel: 'email' | 'sms') {
  return channel === 'sms'
    ? {
        type: 'tel' as const,
        inputMode: 'numeric' as const,
        placeholder: '(555) 123-4567',
        autoComplete: 'tel-national',
        maxLength: 32,
        label: 'Phone number',
      }
    : {
        type: 'email' as const,
        inputMode: 'email' as const,
        placeholder: 'your@email.com',
        autoComplete: 'email',
        maxLength: 254,
        label: 'Email address',
      };
}

/**
 * Get display value for input based on channel.
 */
function getInputDisplayValue(
  channel: 'email' | 'sms',
  phoneInput: string,
  emailInput: string,
  dialCode: string
): string {
  return channel === 'sms'
    ? formatPhoneDigitsForDisplay(phoneInput, dialCode)
    : emailInput;
}

/**
 * Get the submit button label based on current form state.
 */
function getSubmitButtonLabel(isSubmitting: boolean, otpStep: string): string {
  if (isSubmitting) return 'Working…';
  if (otpStep === 'verify') return 'Verify Code';
  return 'Get Notified';
}

/**
 * Get the heading text for the subscribe form.
 */
function getFormHeading(otpStep: string): string {
  return otpStep === 'verify'
    ? 'Check your inbox. Enter your code.'
    : 'Never miss a release.';
}

/** Whether the fallback CTA should be shown instead of the subscribe form. */
function shouldShowFallbackCTA(
  notificationsEnabled: boolean,
  notificationsState: string,
  autoOpen: boolean,
  forceExpanded: boolean,
  hideListenFallback: boolean
): boolean {
  if (hideListenFallback || forceExpanded) {
    return false;
  }

  return !notificationsEnabled || (notificationsState === 'idle' && !autoOpen);
}

interface FeedbackMessageParams {
  readonly error: string | null;
  readonly showInlineErrorCopy: boolean;
  readonly disclaimerId: string;
  readonly confirmMessage: string | null;
  readonly otpStep: string;
  readonly isInputFocused: boolean;
}

function getFeedbackMessage({
  error,
  showInlineErrorCopy,
  disclaimerId,
  confirmMessage,
  otpStep,
  isInputFocused,
}: FeedbackMessageParams): React.ReactNode {
  if (error && showInlineErrorCopy) {
    return (
      <span id={disclaimerId} role='alert'>
        {error}
      </span>
    );
  }
  if (confirmMessage) {
    return (
      <span id={disclaimerId} className={subscriptionSuccessTextClassName}>
        {confirmMessage}
      </span>
    );
  }
  if (otpStep === 'verify') {
    return (
      <span id={disclaimerId}>
        Enter the 6-digit code we sent to your email.
      </span>
    );
  }
  if (isInputFocused) {
    return <span id={disclaimerId}>No spam. Opt-out anytime.</span>;
  }
  return null;
}

interface ComposerSlotsParams {
  readonly otpStep: string;
  readonly shouldShowCountrySelector: boolean;
  readonly smsEnabled: boolean;
  readonly channel: 'email' | 'sms';
  readonly isInputFocused: boolean;
  readonly isSubmitting: boolean;
  readonly country: Parameters<typeof CountrySelector>[0]['country'];
  readonly isCountryOpen: boolean;
  readonly setIsCountryOpen: (open: boolean) => void;
  readonly setCountry: (
    c: Parameters<typeof CountrySelector>[0]['country']
  ) => void;
  readonly handleChannelChange: (ch: 'email' | 'sms') => void;
}

function getComposerLeftSlot({
  otpStep,
  shouldShowCountrySelector,
  smsEnabled,
  channel,
  isSubmitting,
  country,
  isCountryOpen,
  setIsCountryOpen,
  setCountry,
  handleChannelChange,
}: ComposerSlotsParams): React.ReactNode {
  if (otpStep === 'verify') return undefined;
  if (shouldShowCountrySelector) {
    return (
      <CountrySelector
        country={country}
        isOpen={isCountryOpen}
        onOpenChange={setIsCountryOpen}
        onSelect={setCountry}
      />
    );
  }
  if (smsEnabled) {
    return (
      <ChannelToggle
        channel={channel}
        isSubmitting={isSubmitting}
        onChannelChange={handleChannelChange}
      />
    );
  }
  return undefined;
}

function getComposerClassName(
  otpStep: string,
  isInputFocused: boolean
): string | undefined {
  if (otpStep === 'verify') return 'px-3 py-3';
  if (isInputFocused) return subscriptionComposerFocusClassName;
  return undefined;
}

/** Whether the subscribe form should trigger impression tracking. */
function isSubscribeFormVisible(
  notificationsEnabled: boolean,
  notificationsState: string,
  autoOpen: boolean,
  forceExpanded: boolean,
  hideListenFallback: boolean
): boolean {
  if (
    shouldShowFallbackCTA(
      notificationsEnabled,
      notificationsState,
      autoOpen,
      forceExpanded,
      hideListenFallback
    )
  ) {
    return false;
  }
  return (
    notificationsState !== 'success' &&
    notificationsState !== 'pending_confirmation'
  );
}

export function ArtistNotificationsCTA({
  artist,
  variant = 'link',
  autoOpen = false,
  forceExpanded = false,
  hideListenFallback = false,
  source,
}: ArtistNotificationsCTAProps) {
  const {
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
  } = useSubscriptionForm({ artist, source });

  const inputId = useId();
  const disclaimerId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { showInlineErrorCopy, shouldShowDesktopTooltip } =
    useSubscriptionErrorFeedback({
      error,
      errorOrigin,
    });

  useInputFocusRegistration(inputRef, registerInputFocus);
  usePhoneInputConstraint(country.dialCode, phoneInput, handlePhoneChange);
  useAutoFocusOnEdit(notificationsState, inputRef);
  useAutoOpen(
    autoOpen,
    notificationsEnabled,
    notificationsState,
    openSubscription
  );
  useEffect(() => {
    return () => clearOtpConfirmTimeout(confirmTimeoutRef);
  }, []);

  const showsSubscribeForm = isSubscribeFormVisible(
    notificationsEnabled,
    notificationsState,
    autoOpen,
    forceExpanded,
    hideListenFallback
  );
  useImpressionTracking(showsSubscribeForm, artist.handle, variant);

  const hasSubscriptions = Boolean(
    subscribedChannels.email || subscribedChannels.sms
  );
  const isSubscribed = notificationsState === 'success' && hasSubscriptions;

  useSubscribeModeRedirect(autoOpen, isSubscribed, artist.handle, artist.name);

  const shouldShowCountrySelector =
    otpStep === 'input' && channel === 'sms' && phoneInput.length > 0;

  // Show loading skeleton while checking subscription status
  if (hydrationStatus === 'checking') {
    return (
      <div className='min-h-[180px]'>
        <SubscriptionFormSkeleton />
      </div>
    );
  }

  if (
    shouldShowFallbackCTA(
      notificationsEnabled,
      notificationsState,
      autoOpen,
      forceExpanded,
      hideListenFallback
    )
  ) {
    return (
      <div className='min-h-[180px]'>
        <ListenNowCTA variant={variant} handle={artist.handle} />
      </div>
    );
  }

  if (isSubscribed) {
    return (
      <div className='min-h-[180px]'>
        <SubscriptionSuccess
          artistName={artist.name}
          handle={artist.handle}
          subscribedChannels={subscribedChannels}
          artistId={artist.id}
          subscriberEmail={getSubscriberEmail({ channel, emailInput })}
        />
      </div>
    );
  }

  const inputConfig = getInputConfig(channel);
  const inputValue = getInputDisplayValue(
    channel,
    phoneInput,
    emailInput,
    country.dialCode
  );

  const handleInputChange =
    channel === 'sms' ? handlePhoneChange : handleEmailChange;

  const handleInputBlur = () => {
    setIsInputFocused(false);
    handleFieldBlur();
  };

  const handleFormSubmit =
    otpStep === 'verify' ? handleVerifyOtp : handleSubscribe;

  const handleOtpResend = () => {
    requestOtpResendConfirmation({
      handleResendOtp,
      confirmTimeoutRef,
      setConfirmMessage,
    });
  };

  let feedbackSideAction: React.ReactNode;
  if (otpStep === 'verify') {
    feedbackSideAction = (
      <>
        {error && shouldShowDesktopTooltip ? (
          <SubscriptionDesktopErrorIndicator error={error} />
        ) : null}
        <SubscriptionOtpResendAction
          resendCooldownEnd={resendCooldownEnd}
          isResending={isResending}
          onResend={handleOtpResend}
        />
      </>
    );
  } else if (error && shouldShowDesktopTooltip) {
    feedbackSideAction = <SubscriptionDesktopErrorIndicator error={error} />;
  }

  const leftSlot = getComposerLeftSlot({
    otpStep,
    shouldShowCountrySelector,
    smsEnabled,
    channel,
    isInputFocused,
    isSubmitting,
    country,
    isCountryOpen,
    setIsCountryOpen,
    setCountry,
    handleChannelChange,
  });

  const actionClassName =
    otpStep === 'verify'
      ? `${subscriptionPrimaryActionClassName} min-w-[7rem]`
      : subscriptionPrimaryActionClassName;

  const composerClassName = getComposerClassName(otpStep, isInputFocused);

  return (
    <div className='min-h-[180px] space-y-3'>
      <p className={subscriptionHeadingClassName} style={noFontSynthesisStyle}>
        {getFormHeading(otpStep)}
      </p>

      <SubscriptionPearlComposer
        dataTestId='subscription-pearl-composer'
        layout={otpStep === 'verify' ? 'stacked' : 'inline'}
        leftSlot={leftSlot}
        action={
          <button
            type='button'
            onClick={() => {
              handleFormSubmit();
            }}
            disabled={isSubmitting || (otpStep === 'verify' && Boolean(error))}
            className={actionClassName}
            style={noFontSynthesisStyle}
          >
            {getSubmitButtonLabel(isSubmitting, otpStep)}
          </button>
        }
        className={composerClassName}
      >
        <ComposerInputContent
          otpStep={otpStep}
          otpCode={otpCode}
          handleOtpChange={handleOtpChange}
          handleVerifyOtp={handleVerifyOtp}
          isSubmitting={isSubmitting}
          error={error}
          inputRef={inputRef}
          inputId={inputId}
          disclaimerId={disclaimerId}
          inputConfig={inputConfig}
          inputValue={inputValue}
          handleInputChange={handleInputChange}
          handleInputBlur={handleInputBlur}
          handleKeyDown={handleKeyDown}
          setIsInputFocused={setIsInputFocused}
        />
      </SubscriptionPearlComposer>

      <SubscriptionFeedbackRail
        message={getFeedbackMessage({
          error,
          showInlineErrorCopy,
          disclaimerId,
          confirmMessage,
          otpStep,
          isInputFocused,
        })}
        sideAction={feedbackSideAction}
      />
    </div>
  );
}
