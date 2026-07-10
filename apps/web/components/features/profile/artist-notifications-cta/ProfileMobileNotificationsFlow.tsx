'use client';

import { Switch } from '@jovie/ui';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Mail,
  MessageCircle,
  Music2,
  Send,
  Shirt,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OtpInput } from '@/features/auth/atoms/otp-input';
import {
  type CountryOption,
  CountrySelector,
} from '@/features/profile/notifications';
import { PROFILE_Z } from '@/lib/profile/z-index-constants';
import { cn } from '@/lib/utils';
import type { NotificationContentType } from '@/types/notifications';
import { BirthdayInput } from './BirthdayInput';

export type ProfileMobileNotificationsFlowStep =
  | 'email'
  | 'capture_success'
  | 'otp'
  | 'name'
  | 'birthday'
  | 'preferences'
  | 'done';

interface ProfileMobileNotificationsFlowProps {
  readonly open: boolean;
  readonly presentation?: 'inline' | 'overlay' | 'modal';
  readonly portalContainer?: HTMLElement | null;
  readonly artistName: string;
  readonly channel?: 'email' | 'sms';
  readonly country: CountryOption;
  readonly step: ProfileMobileNotificationsFlowStep;
  readonly accentHex?: string | null;
  readonly emailInput: string;
  readonly phoneInput: string;
  readonly successContactEcho?: string | null;
  readonly otpCode: string;
  readonly nameInput: string;
  readonly birthdayInput: string;
  readonly error: string | null;
  readonly isSubmitting: boolean;
  readonly isNameSaving: boolean;
  readonly isBirthdaySaving: boolean;
  readonly isPreferencesSaving: boolean;
  readonly birthdayHintShown: boolean;
  readonly resendCooldownEnd: number;
  readonly isResending: boolean;
  readonly isCountryOpen: boolean;
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly canEditPreferences?: boolean;
  readonly canGoBackFromPreferences?: boolean;
  readonly artistEmailOptIn?: boolean;
  readonly artistEmailReady?: boolean;
  readonly showArtistEmailSection?: boolean;
  readonly onClose: () => void;
  readonly onBack: () => void;
  readonly onChannelChange: (channel: 'email' | 'sms') => void;
  readonly onCountryOpenChange: (open: boolean) => void;
  readonly onCountrySelect: (country: CountryOption) => void;
  readonly onEmailChange: (value: string) => void;
  readonly onPhoneChange: (value: string) => void;
  readonly onEmailSubmit: () => void;
  readonly onDismissCapture?: () => void;
  readonly onOtpChange: (value: string) => void;
  readonly onOtpComplete: (value: string) => void;
  readonly onOtpSubmit: () => void;
  readonly onResendOtp: () => void;
  readonly onNameChange: (value: string) => void;
  readonly onNameSubmit: () => void;
  readonly onBirthdayChange: (value: string) => void;
  readonly onBirthdaySubmit: (overrideDigits?: string) => void;
  readonly onTogglePref: (key: NotificationContentType) => void;
  readonly onArtistEmailToggle?: (value: boolean) => void;
  readonly onPreferencesSubmit: () => void;
}

const FLOW_TRANSITION = {
  duration: 0.42,
  ease: [0.22, 1, 0.36, 1] as const,
};

const CAPTURE_CONSENT_COPY =
  'By submitting, you agree to receive updates from this artist and Jovie. Reply STOP to opt out. Message and data rates may apply.';

const PREFERENCE_META: Record<
  Extract<NotificationContentType, 'newMusic' | 'tourDates' | 'merch'>,
  {
    readonly label: string;
    readonly icon: typeof Music2;
  }
> = {
  newMusic: {
    label: 'New Music',
    icon: Music2,
  },
  tourDates: {
    label: 'Shows',
    icon: CalendarDays,
  },
  merch: {
    label: 'Merch',
    icon: Shirt,
  },
};

const JOVIE_ALERT_KEYS = ['newMusic', 'tourDates', 'merch'] as const;

function formatCountdown(endTime: number) {
  const remainingMs = endTime - Date.now();
  if (remainingMs <= 0) {
    return 'Resend code';
  }

  const remainingSeconds = Math.ceil(remainingMs / 1000);
  return `Resend in ${remainingSeconds}s`;
}

function ScreenShell({
  title,
  body,
  children,
  footer,
  /**
   * `compact` vertically centers the title + field + CTA as one balanced group
   * instead of stretching the field region and pinning the footer to the bottom.
   * Used for short single-field steps so the field and CTA
   * read as one unit with no dead vertical space (JOV-3555).
   */
  compact = false,
}: Readonly<{
  title: string;
  body?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  compact?: boolean;
}>) {
  if (compact) {
    return (
      <div className='flex flex-1 flex-col justify-center'>
        <div className='space-y-5'>
          <div className='space-y-2'>
            <h2 className='text-xl font-semibold leading-[1.08] tracking-normal dark:text-white'>
              {title}
            </h2>
            {body ? (
              <p className='max-w-96 text-sm leading-5 text-white/58'>{body}</p>
            ) : null}
          </div>
          <div>{children}</div>
          <div>{footer}</div>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-1 flex-col'>
      <div className='space-y-2 pb-6 pt-2'>
        <h2 className='text-xl font-semibold leading-[1.08] tracking-normal dark:text-white'>
          {title}
        </h2>
        {body ? (
          <p className='max-w-96 text-sm leading-5 text-white/58'>{body}</p>
        ) : null}
      </div>
      <div className='flex-1'>{children}</div>
      <div className='pt-6'>{footer}</div>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: Readonly<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}>) {
  const handledPointerActivationRef = useRef(false);

  const activate = () => {
    if (disabled) return;
    onClick();
  };

  return (
    <button
      type='button'
      onPointerDown={event => {
        if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) {
          return;
        }
        handledPointerActivationRef.current = true;
        activate();
      }}
      onClick={() => {
        if (handledPointerActivationRef.current) {
          handledPointerActivationRef.current = false;
          return;
        }
        activate();
      }}
      disabled={disabled}
      className='inline-flex h-12 w-full items-center justify-center rounded-3xl bg-white/14 px-5 text-sm font-semibold tracking-[-0.01em] text-(--color-text-tooltip) transition-colors duration-subtle hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60'
    >
      {children}
    </button>
  );
}

function SecondaryTextButton({
  children,
  onClick,
  disabled = false,
}: Readonly<{
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}>) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className='inline-flex h-10 w-full items-center justify-center rounded-3xl px-5 text-app font-medium tracking-[-0.005em] text-white/58 transition-colors duration-subtle hover:text-white/76 disabled:cursor-not-allowed disabled:opacity-60'
    >
      {children}
    </button>
  );
}

function LabeledInput({
  label,
  value,
  placeholder,
  type = 'text',
  inputMode = 'text',
  autoComplete,
  onChange,
  onKeyDown,
  disabled = false,
  testId,
}: Readonly<{
  label: string;
  value: string;
  placeholder: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  autoComplete?: string;
  onChange: (value: string) => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  disabled?: boolean;
  testId?: string;
}>) {
  return (
    <label className='block space-y-2'>
      <span className='text-app font-medium tracking-[-0.01em] text-white/42'>
        {label}
      </span>
      <input
        data-testid={testId}
        type={type}
        inputMode={inputMode}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className='h-12 w-full touch-manipulation rounded-3xl border border-white/10 bg-white/[0.03] px-4 text-base font-medium tracking-[-0.005em] dark:text-white placeholder:text-white/28 focus:border-white/18 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
      />
    </label>
  );
}

function InlineCaptureField({
  channel,
  country,
  isCountryOpen,
  value,
  placeholder,
  isSubmitting,
  onCountryOpenChange,
  onCountrySelect,
  onValueChange,
  onSubmit,
}: Readonly<{
  channel: 'email' | 'sms';
  country: CountryOption;
  isCountryOpen: boolean;
  value: string;
  placeholder: string;
  isSubmitting: boolean;
  onCountryOpenChange: (open: boolean) => void;
  onCountrySelect: (country: CountryOption) => void;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
}>) {
  return (
    <div className='rounded-(--profile-action-radius) border border-white/10 bg-white/[0.035] p-1.5'>
      <div className='flex min-h-13 items-center gap-1'>
        {channel === 'sms' ? (
          <CountrySelector
            country={country}
            isOpen={isCountryOpen}
            onOpenChange={onCountryOpenChange}
            onSelect={onCountrySelect}
          />
        ) : (
          <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/46'>
            <Mail className='size-4.5' />
          </span>
        )}
        <input
          data-testid='mobile-email-input'
          type={channel === 'sms' ? 'tel' : 'email'}
          inputMode={channel === 'sms' ? 'tel' : 'email'}
          autoComplete={channel === 'sms' ? 'tel' : 'email'}
          value={value}
          placeholder={placeholder}
          onChange={event => onValueChange(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit();
            }
          }}
          disabled={isSubmitting}
          aria-label={channel === 'sms' ? 'Phone Number' : 'Email Address'}
          className='h-11 min-w-0 flex-1 bg-transparent px-1 text-base font-medium tracking-[-0.005em] dark:text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
        />
        <button
          type='button'
          onClick={onSubmit}
          disabled={isSubmitting}
          className='inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition-opacity duration-subtle hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-55 dark:bg-white dark:text-black'
          aria-label='Submit'
        >
          <Send className='size-4' />
        </button>
      </div>
    </div>
  );
}

export function ProfileMobileNotificationsFlow({
  open,
  presentation = 'overlay',
  portalContainer,
  artistName,
  channel = 'email',
  country,
  step,
  accentHex = '#8b5cf6',
  emailInput,
  phoneInput,
  successContactEcho = null,
  otpCode,
  nameInput,
  birthdayInput,
  error,
  isSubmitting,
  isNameSaving,
  isBirthdaySaving,
  isPreferencesSaving,
  birthdayHintShown,
  resendCooldownEnd,
  isResending,
  isCountryOpen,
  contentPrefs,
  canEditPreferences = false,
  canGoBackFromPreferences = false,
  artistEmailOptIn = false,
  showArtistEmailSection = false,
  onClose,
  onBack,
  onChannelChange,
  onCountryOpenChange,
  onCountrySelect,
  onEmailChange,
  onPhoneChange,
  onEmailSubmit,
  onDismissCapture,
  onOtpChange,
  onOtpComplete,
  onOtpSubmit,
  onResendOtp,
  onNameChange,
  onNameSubmit,
  onBirthdayChange,
  onBirthdaySubmit,
  onTogglePref,
  onArtistEmailToggle,
  onPreferencesSubmit,
}: Readonly<ProfileMobileNotificationsFlowProps>) {
  const [mounted, setMounted] = useState(false);
  const isResendCooldownActive = resendCooldownEnd > Date.now();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    // Inline presentations live inside an existing layout — they should not
    // hijack body scroll the way overlay/modal presentations do.
    if (presentation === 'inline') {
      return;
    }

    const scrollY = window.scrollY;
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const profileViewports = Array.from(
      document.querySelectorAll<HTMLElement>('.profile-viewport')
    );
    const resetViewportScroll = () => {
      window.scrollTo(0, 0);
      for (const viewport of profileViewports) {
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      }
    };

    resetViewportScroll();
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = '0';
    document.body.style.width = '100%';
    document.documentElement.style.overflow = 'hidden';

    const handleViewportScroll = () => {
      requestAnimationFrame(resetViewportScroll);
    };

    for (const viewport of profileViewports) {
      viewport.addEventListener('scroll', handleViewportScroll, {
        passive: true,
      });
    }
    document.addEventListener('focusin', resetViewportScroll);

    return () => {
      for (const viewport of profileViewports) {
        viewport.removeEventListener('scroll', handleViewportScroll);
      }
      document.removeEventListener('focusin', resetViewportScroll);
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      document.documentElement.style.overflow = originalHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [open, presentation]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, open]);

  if (!mounted || !open) {
    return null;
  }

  const screen = (() => {
    if (step === 'email') {
      const isSms = channel === 'sms';
      const fieldValue = isSms ? phoneInput : emailInput;
      return (
        <ScreenShell
          compact
          title='Get Updates'
          body={`${artistName}: music, shows, merch.`}
          footer={
            <div className='min-h-27 space-y-3'>
              {error ? (
                <p className='text-sm text-red-400' role='alert'>
                  {error}
                </p>
              ) : null}
              <p className='text-xs leading-4 text-white/42'>
                {CAPTURE_CONSENT_COPY}
              </p>
              <div className='flex items-center justify-between gap-3'>
                <button
                  type='button'
                  onClick={() => onChannelChange(isSms ? 'email' : 'sms')}
                  disabled={isSubmitting}
                  className='inline-flex h-11 items-center gap-1.5 rounded-full px-1 text-xs font-semibold text-white/62 transition-colors duration-subtle hover:text-white disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {isSms ? (
                    <Mail className='size-3.5' />
                  ) : (
                    <MessageCircle className='size-3.5' />
                  )}
                  {isSms ? 'Use Email' : 'Use SMS'}
                </button>
                {onDismissCapture ? (
                  <button
                    type='button'
                    onClick={onDismissCapture}
                    disabled={isSubmitting}
                    className='inline-flex h-11 items-center rounded-full px-1 text-xs font-semibold text-white/48 transition-colors duration-subtle hover:text-white/70 disabled:cursor-not-allowed disabled:opacity-50'
                  >
                    Not Now
                  </button>
                ) : null}
              </div>
            </div>
          }
        >
          <InlineCaptureField
            channel={channel}
            country={country}
            isCountryOpen={isCountryOpen}
            value={fieldValue}
            placeholder={isSms ? '555 123 4567' : 'you@email.com'}
            isSubmitting={isSubmitting}
            onCountryOpenChange={onCountryOpenChange}
            onCountrySelect={onCountrySelect}
            onValueChange={isSms ? onPhoneChange : onEmailChange}
            onSubmit={onEmailSubmit}
          />
        </ScreenShell>
      );
    }

    if (step === 'capture_success') {
      return (
        <ScreenShell
          compact
          title='You’re On The List'
          body={
            successContactEcho
              ? `Updates are on for ${successContactEcho}.`
              : `${artistName} updates are on.`
          }
          footer={
            <p className='min-h-10 text-sm text-white/46'>
              Setting up your preferences...
            </p>
          }
        >
          <div className='flex min-h-28 items-center justify-center'>
            <div
              className='flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] shadow-[0_20px_44px_rgba(0,0,0,0.28)]'
              style={
                {
                  boxShadow: `0 20px 44px rgba(0,0,0,0.28), inset 0 0 0 1px ${accentHex}55`,
                } as CSSProperties
              }
            >
              <Check className='h-9 w-9 dark:text-white' />
            </div>
          </div>
        </ScreenShell>
      );
    }

    if (step === 'otp') {
      return (
        <ScreenShell
          title='Enter the code'
          body={`Confirm your ${channel === 'sms' ? 'phone' : 'email'}.`}
          footer={
            <div className='space-y-3'>
              {error ? (
                <p className='text-sm text-red-400' role='alert'>
                  {error}
                </p>
              ) : null}
              <PrimaryButton
                onClick={onOtpSubmit}
                disabled={otpCode.length !== 6 || isSubmitting}
              >
                Verify
              </PrimaryButton>
              <SecondaryTextButton
                onClick={onResendOtp}
                disabled={isResending || isResendCooldownActive}
              >
                {isResending
                  ? 'Sending...'
                  : formatCountdown(resendCooldownEnd)}
              </SecondaryTextButton>
            </div>
          }
        >
          <div className='rounded-3xl border border-white/10 bg-white/[0.03] p-4'>
            <OtpInput
              value={otpCode}
              onChange={onOtpChange}
              onComplete={onOtpComplete}
              autoFocus={step === 'otp'}
              aria-label='Enter Verification Code'
              disabled={isSubmitting}
              error={Boolean(error)}
              size='compact'
              showProgressDots={false}
            />
          </div>
        </ScreenShell>
      );
    }

    if (step === 'name') {
      return (
        <ScreenShell
          title='First Name'
          body='Optional. Personalizes updates.'
          footer={
            <PrimaryButton onClick={onNameSubmit} disabled={isNameSaving}>
              Continue
            </PrimaryButton>
          }
        >
          <LabeledInput
            label='First Name'
            value={nameInput}
            placeholder='Alex'
            autoComplete='given-name'
            onChange={onNameChange}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onNameSubmit();
              }
            }}
            disabled={isNameSaving}
            testId='mobile-name-input'
          />
        </ScreenShell>
      );
    }

    if (step === 'birthday') {
      return (
        <ScreenShell
          title='Birthday'
          body='Optional. It stays private.'
          footer={
            <div className='space-y-3'>
              {birthdayHintShown ? (
                <p className='text-sm text-white/52'>
                  Enter a full date to save it.
                </p>
              ) : null}
              <PrimaryButton
                onClick={() => onBirthdaySubmit()}
                disabled={isBirthdaySaving}
              >
                Continue
              </PrimaryButton>
            </div>
          }
        >
          {/*
            Segmented BirthdayInput (not native/Radix selects): avoids OS listbox
            overflow on desktop and reuses the existing on-system MM/DD/YYYY primitive
            (GH-13389). Testids live on each digit group for keyboard + e2e parity.
          */}
          <BirthdayInput
            value={birthdayInput}
            onChange={onBirthdayChange}
            onSubmit={() => onBirthdaySubmit()}
            disabled={isBirthdaySaving}
            error={birthdayHintShown}
            autoFocus
          />
        </ScreenShell>
      );
    }

    if (step === 'preferences') {
      return (
        <ScreenShell
          title='Alerts'
          footer={
            canEditPreferences ? (
              <PrimaryButton
                onClick={onPreferencesSubmit}
                disabled={isPreferencesSaving}
              >
                Save & Finish
              </PrimaryButton>
            ) : null
          }
        >
          <div className='space-y-6'>
            <div className='space-y-3'>
              <p
                className='text-app font-semibold tracking-[-0.01em] text-white/42'
                data-testid='profile-mobile-notifications-sent-from'
              >
                Sent from Jovie
              </p>

              {(JOVIE_ALERT_KEYS as readonly NotificationContentType[]).map(
                key => {
                  const meta =
                    PREFERENCE_META[key as keyof typeof PREFERENCE_META];
                  const enabled = Boolean(contentPrefs[key]);
                  const Icon = meta.icon;

                  return (
                    <div
                      key={key}
                      className='flex items-center justify-between gap-4 py-2'
                    >
                      <div className='flex items-center gap-3'>
                        <span className='inline-flex h-8 w-8 items-center justify-center text-white/68'>
                          <Icon className='size-4.5' />
                        </span>
                        <span className='text-mid font-medium tracking-[-0.015em] text-white/88'>
                          {meta.label}
                        </span>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => onTogglePref(key)}
                        aria-label={meta.label}
                        className='data-[state=checked]:bg-(--mobile-flow-accent) data-[state=unchecked]:bg-white/14'
                      />
                    </div>
                  );
                }
              )}
            </div>

            {showArtistEmailSection ? (
              <>
                <div className='h-px bg-white/8' />
                <div className='space-y-3'>
                  <p className='text-app font-semibold tracking-[-0.01em] text-white/42'>
                    Sent by {artistName}
                  </p>

                  <div className='flex items-center justify-between gap-4 py-2'>
                    <div className='flex items-center gap-3'>
                      <span className='inline-flex h-8 w-8 items-center justify-center text-white/68'>
                        <Mail className='size-4.5' />
                      </span>
                      <div>
                        <p className='text-mid font-medium tracking-[-0.015em] text-white/88'>
                          Artist Emails
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={artistEmailOptIn}
                      onCheckedChange={checked =>
                        onArtistEmailToggle?.(checked)
                      }
                      aria-label='Artist Emails'
                      className='data-[state=checked]:bg-(--mobile-flow-accent) data-[state=unchecked]:bg-white/14'
                    />
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </ScreenShell>
      );
    }

    return (
      <ScreenShell
        title='Alerts On'
        body={`${artistName} alerts are on.`}
        footer={
          <PrimaryButton onClick={onClose}>Back to Profile</PrimaryButton>
        }
      >
        <div className='flex h-full items-center justify-center'>
          <div
            className='flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] shadow-[0_20px_44px_rgba(0,0,0,0.28)]'
            style={
              {
                boxShadow: `0 20px 44px rgba(0,0,0,0.28), inset 0 0 0 1px ${accentHex}55`,
              } as CSSProperties
            }
          >
            <Check className='h-10 w-10 dark:text-white' />
          </div>
        </div>
      </ScreenShell>
    );
  })();

  const isRootPreferencesStep =
    step === 'preferences' && !canGoBackFromPreferences;
  const isFirstStep = step === 'email';
  const showBackButton =
    step !== 'done' &&
    !isFirstStep &&
    (!isRootPreferencesStep || presentation !== 'inline');
  const showCloseButton = presentation === 'modal';

  const contentBody = (
    <>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.055),transparent_42%)]' />

      <div
        className={cn(
          'relative mx-auto flex w-full max-w-108 flex-col px-5',
          presentation === 'overlay'
            ? 'h-full pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),18px)]'
            : 'h-full pb-8 pt-6',
          presentation === 'modal' && 'min-[1180px]:max-w-130'
        )}
      >
        <header className='flex items-center justify-between pb-5'>
          {showBackButton ? (
            <button
              type='button'
              onClick={onBack}
              className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/78 transition-colors duration-subtle hover:bg-white/[0.08]'
              aria-label={isRootPreferencesStep ? 'Close' : 'Back'}
            >
              <ChevronLeft className='h-5 w-5' />
            </button>
          ) : (
            <span className='h-10 w-10' aria-hidden='true' />
          )}

          {showCloseButton ? (
            <button
              type='button'
              onClick={onClose}
              className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/78 transition-colors duration-subtle hover:bg-white/[0.08]'
              aria-label='Close'
            >
              <X className='size-4.5' />
            </button>
          ) : (
            <span className='h-10 w-10' aria-hidden='true' />
          )}
        </header>

        <AnimatePresence mode='wait'>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={FLOW_TRANSITION}
            className='flex min-h-0 flex-1 flex-col'
            data-testid={`profile-mobile-notifications-step-${step}`}
          >
            {screen}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );

  const overlayRootClassName =
    portalContainer === undefined
      ? `pointer-events-auto fixed inset-0 ${PROFILE_Z.FULLSCREEN_FLOW}`
      : `pointer-events-auto absolute inset-0 ${PROFILE_Z.FULLSCREEN_FLOW}`;
  const contentStyle = {
    '--mobile-flow-accent': accentHex,
  } as CSSProperties;

  const content =
    presentation === 'overlay' ? (
      <div
        className={cn(
          overlayRootClassName,
          'bg-[color:var(--profile-stage-bg)] dark:text-white'
        )}
        data-testid='profile-mobile-notifications-flow'
        role='dialog'
        aria-modal='true'
        style={contentStyle}
      >
        {contentBody}
      </div>
    ) : presentation === 'modal' ? (
      <div
        className={cn(
          overlayRootClassName,
          'flex items-center justify-center bg-black/52 px-4 py-6 dark:text-white backdrop-blur-sm'
        )}
        data-testid='profile-mobile-notifications-flow'
        role='dialog'
        aria-modal='true'
        style={contentStyle}
      >
        <div className='relative flex h-[min(760px,calc(100dvh-48px))] w-full max-w-110 flex-col overflow-hidden rounded-(--profile-card-radius) border border-white/10 bg-[color:var(--profile-stage-bg)] shadow-[0_34px_96px_rgba(0,0,0,0.48)] min-[1180px]:max-w-160'>
          {contentBody}
        </div>
      </div>
    ) : (
      <div
        className='relative flex h-full min-h-full flex-1 flex-col rounded-(--profile-card-radius) bg-[color:var(--profile-stage-bg)] dark:text-white'
        data-testid='profile-mobile-notifications-flow'
        data-shell-variant='inline-full-height'
        style={contentStyle}
      >
        {contentBody}
      </div>
    );

  if (presentation === 'inline') {
    return content;
  }

  if (portalContainer === null) {
    return null;
  }

  return createPortal(content, portalContainer ?? document.body);
}
