'use client';

import { Switch } from '@jovie/ui';
import {
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  Mail,
  Music2,
  Shirt,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { type CSSProperties, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { OtpInput } from '@/features/auth/atoms/otp-input';
import { cn } from '@/lib/utils';
import type { NotificationContentType } from '@/types/notifications';

export type ProfileMobileNotificationsFlowStep =
  | 'intro'
  | 'email'
  | 'otp'
  | 'name'
  | 'birthday'
  | 'preferences'
  | 'done';

interface ProfileMobileNotificationsFlowProps {
  readonly open: boolean;
  readonly presentation?: 'inline' | 'overlay';
  readonly artistName: string;
  readonly channel?: 'email' | 'sms';
  readonly step: ProfileMobileNotificationsFlowStep;
  readonly accentHex?: string | null;
  readonly emailInput: string;
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
  readonly contentPrefs: Record<NotificationContentType, boolean>;
  readonly artistEmailOptIn?: boolean;
  readonly artistEmailReady?: boolean;
  readonly showArtistEmailSection?: boolean;
  readonly onClose: () => void;
  readonly onBack: () => void;
  readonly onEmailChange: (value: string) => void;
  readonly onEmailSubmit: () => void;
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
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const,
};

const MONTH_OPTIONS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

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

function extractBirthdayParts(value: string) {
  return {
    month: value.slice(0, 2),
    day: value.slice(2, 4),
    year: value.slice(4, 8),
  };
}

function combineBirthdayParts(params: {
  month: string;
  day: string;
  year: string;
}) {
  return `${params.month}${params.day}${params.year}`.slice(0, 8);
}

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
}: Readonly<{
  title: string;
  body?: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}>) {
  return (
    <div className='flex flex-1 flex-col'>
      <div className='space-y-3 pb-8 pt-4'>
        <h2 className='text-[2rem] font-semibold leading-[1.02] tracking-[-0.06em] text-white'>
          {title}
        </h2>
        {body ? (
          <p className='max-w-[24rem] text-[15px] leading-6 text-white/58'>
            {body}
          </p>
        ) : null}
      </div>
      <div className='flex-1'>{children}</div>
      <div className='pt-8'>{footer}</div>
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
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className='inline-flex h-14 w-full items-center justify-center rounded-[18px] bg-white/14 px-5 text-[15px] font-semibold tracking-[-0.02em] text-white transition-colors duration-200 hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60'
    >
      {children}
    </button>
  );
}

function SecondaryTextButton({
  children,
  onClick,
}: Readonly<{
  children: React.ReactNode;
  onClick: () => void;
}>) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='inline-flex h-12 w-full items-center justify-center rounded-[18px] px-5 text-[15px] font-medium tracking-[-0.02em] text-white/58 transition-colors duration-200 hover:text-white/76'
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
      <span className='text-[13px] font-medium tracking-[-0.01em] text-white/42'>
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
        className='h-14 w-full rounded-[18px] border border-white/10 bg-white/[0.03] px-4 text-[15px] font-medium tracking-[-0.015em] text-white placeholder:text-white/28 focus:border-white/18 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
      />
    </label>
  );
}

function BirthdaySelectors({
  value,
  onChange,
}: Readonly<{
  value: string;
  onChange: (value: string) => void;
}>) {
  const parts = extractBirthdayParts(value);
  const currentYear = new Date().getFullYear();
  const yearOptions = useMemo(
    () => Array.from({ length: 100 }, (_, index) => currentYear - index),
    [currentYear]
  );

  const updatePart = (key: 'month' | 'day' | 'year', nextValue: string) => {
    const nextParts = { ...parts, [key]: nextValue };
    onChange(
      combineBirthdayParts({
        month: nextParts.month,
        day: nextParts.day,
        year: nextParts.year,
      })
    );
  };

  return (
    <div className='grid grid-cols-3 gap-3'>
      <label className='block space-y-2'>
        <span className='text-[13px] font-medium tracking-[-0.01em] text-white/42'>
          Month
        </span>
        <select
          data-testid='mobile-birthday-month'
          value={parts.month}
          onChange={event => updatePart('month', event.target.value)}
          className='h-14 w-full appearance-none rounded-[18px] border border-white/10 bg-white/[0.03] px-4 text-[15px] font-medium tracking-[-0.015em] text-white focus:border-white/18 focus:outline-none'
        >
          <option value=''>Month</option>
          {MONTH_OPTIONS.map((month, index) => (
            <option key={month} value={String(index + 1).padStart(2, '0')}>
              {month}
            </option>
          ))}
        </select>
      </label>

      <label className='block space-y-2'>
        <span className='text-[13px] font-medium tracking-[-0.01em] text-white/42'>
          Day
        </span>
        <select
          data-testid='mobile-birthday-day'
          value={parts.day}
          onChange={event => updatePart('day', event.target.value)}
          className='h-14 w-full appearance-none rounded-[18px] border border-white/10 bg-white/[0.03] px-4 text-[15px] font-medium tracking-[-0.015em] text-white focus:border-white/18 focus:outline-none'
        >
          <option value=''>Day</option>
          {Array.from({ length: 31 }, (_, index) => index + 1).map(day => (
            <option key={day} value={String(day).padStart(2, '0')}>
              {day}
            </option>
          ))}
        </select>
      </label>

      <label className='block space-y-2'>
        <span className='text-[13px] font-medium tracking-[-0.01em] text-white/42'>
          Year
        </span>
        <select
          data-testid='mobile-birthday-year'
          value={parts.year}
          onChange={event => updatePart('year', event.target.value)}
          className='h-14 w-full appearance-none rounded-[18px] border border-white/10 bg-white/[0.03] px-4 text-[15px] font-medium tracking-[-0.015em] text-white focus:border-white/18 focus:outline-none'
        >
          <option value=''>Year</option>
          {yearOptions.map(year => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ProfileMobileNotificationsFlow({
  open,
  presentation = 'overlay',
  artistName,
  channel = 'email',
  step,
  accentHex = '#ed9962',
  emailInput,
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
  contentPrefs,
  artistEmailOptIn = false,
  artistEmailReady = false,
  showArtistEmailSection = false,
  onClose,
  onBack,
  onEmailChange,
  onEmailSubmit,
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

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
    if (step === 'intro') {
      return (
        <ScreenShell
          title='Stay in the loop.'
          body='Get notified about new music, shows, and exclusive updates.'
          footer={
            <div className='space-y-2'>
              <PrimaryButton onClick={onEmailSubmit}>Continue</PrimaryButton>
              <SecondaryTextButton onClick={onClose}>
                Not now
              </SecondaryTextButton>
            </div>
          }
        >
          <div className='flex h-full items-center justify-center'>
            <div className='flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] shadow-[0_28px_60px_rgba(0,0,0,0.32)]'>
              <Bell className='h-10 w-10 text-white/80' />
            </div>
          </div>
        </ScreenShell>
      );
    }

    if (step === 'email') {
      return (
        <ScreenShell
          title={channel === 'sms' ? 'Enter your phone' : 'Enter your email'}
          body="We'll use it to send your alerts."
          footer={
            <div className='space-y-3'>
              {error ? (
                <p className='text-sm text-[#ff8b8b]' role='alert'>
                  {error}
                </p>
              ) : null}
              <PrimaryButton onClick={onEmailSubmit} disabled={isSubmitting}>
                Continue
              </PrimaryButton>
            </div>
          }
        >
          <LabeledInput
            label={channel === 'sms' ? 'Phone number' : 'Email address'}
            value={emailInput}
            placeholder={channel === 'sms' ? '(555) 123-4567' : 'you@email.com'}
            type={channel === 'sms' ? 'tel' : 'email'}
            inputMode={channel === 'sms' ? 'tel' : 'email'}
            autoComplete={channel === 'sms' ? 'tel' : 'email'}
            onChange={onEmailChange}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onEmailSubmit();
              }
            }}
            disabled={isSubmitting}
            testId='mobile-email-input'
          />
        </ScreenShell>
      );
    }

    if (step === 'otp') {
      return (
        <ScreenShell
          title='Enter the code'
          body='Check your inbox for the 6-digit verification code.'
          footer={
            <div className='space-y-3'>
              {error ? (
                <p className='text-sm text-[#ff8b8b]' role='alert'>
                  {error}
                </p>
              ) : null}
              <PrimaryButton
                onClick={onOtpSubmit}
                disabled={otpCode.length !== 6 || isSubmitting}
              >
                Verify
              </PrimaryButton>
              <SecondaryTextButton onClick={onResendOtp}>
                {isResending
                  ? 'Sending...'
                  : formatCountdown(resendCooldownEnd)}
              </SecondaryTextButton>
            </div>
          }
        >
          <div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
            <OtpInput
              value={otpCode}
              onChange={onOtpChange}
              onComplete={onOtpComplete}
              autoFocus={step === 'otp'}
              aria-label='Enter 6-digit verification code'
              disabled={isSubmitting}
              error={Boolean(error)}
              showProgressDots={false}
            />
          </div>
        </ScreenShell>
      );
    }

    if (step === 'name') {
      return (
        <ScreenShell
          title="What's your first name?"
          body='So we can personalize your experience.'
          footer={
            <PrimaryButton onClick={onNameSubmit} disabled={isNameSaving}>
              Continue
            </PrimaryButton>
          }
        >
          <LabeledInput
            label='First name'
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
          title="When's your birthday?"
          body="Your birthday won't be shown publicly."
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
          <BirthdaySelectors
            value={birthdayInput}
            onChange={onBirthdayChange}
          />
        </ScreenShell>
      );
    }

    if (step === 'preferences') {
      return (
        <ScreenShell
          title='Alerts'
          body='Get notified about new music, shows, and more.'
          footer={
            <PrimaryButton
              onClick={onPreferencesSubmit}
              disabled={isPreferencesSaving}
            >
              Save & Finish
            </PrimaryButton>
          }
        >
          <div className='space-y-6'>
            <div className='space-y-3'>
              <div className='space-y-1'>
                <p className='text-[13px] font-semibold tracking-[-0.01em] text-white/42'>
                  Sent from Jovie
                </p>
                <p className='text-[14px] leading-6 text-white/58'>
                  Jovie Alerts are concise, one-time, verified notifications to
                  your {channel === 'sms' ? 'phone' : 'email'} about verified
                  new releases of music and shows.
                </p>
              </div>

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
                          <Icon className='h-4.5 w-4.5' />
                        </span>
                        <span className='text-[15px] font-medium tracking-[-0.015em] text-white/88'>
                          {meta.label}
                        </span>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => onTogglePref(key)}
                        aria-label={meta.label}
                        className='data-[state=checked]:bg-[var(--mobile-flow-accent)] data-[state=unchecked]:bg-white/14'
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
                  <div className='space-y-1'>
                    <p className='text-[13px] font-semibold tracking-[-0.01em] text-white/42'>
                      Sent by {artistName}
                    </p>
                    <p className='text-[14px] leading-6 text-white/58'>
                      {artistEmailReady
                        ? `Share your email with ${artistName} to receive occasional emails about related things.`
                        : `Share your email with ${artistName} to receive occasional emails about related things.`}
                    </p>
                  </div>

                  <div className='flex items-center justify-between gap-4 py-2'>
                    <div className='flex items-center gap-3'>
                      <span className='inline-flex h-8 w-8 items-center justify-center text-white/68'>
                        <Mail className='h-4.5 w-4.5' />
                      </span>
                      <div>
                        <p className='text-[15px] font-medium tracking-[-0.015em] text-white/88'>
                          Subscribe to Other Alerts
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={artistEmailOptIn}
                      onCheckedChange={checked =>
                        onArtistEmailToggle?.(checked)
                      }
                      aria-label='Subscribe to other alerts'
                      className='data-[state=checked]:bg-[var(--mobile-flow-accent)] data-[state=unchecked]:bg-white/14'
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
        title="You're all set!"
        body="We'll send alerts for the things you care about."
        footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}
      >
        <div className='flex h-full items-center justify-center'>
          <div
            className='flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),rgba(255,255,255,0.04))] shadow-[0_28px_60px_rgba(0,0,0,0.32)]'
            style={
              {
                boxShadow: `0 28px 60px rgba(0,0,0,0.32), inset 0 0 0 1px ${accentHex}55`,
              } as CSSProperties
            }
          >
            <Check className='h-12 w-12 text-white' />
          </div>
        </div>
      </ScreenShell>
    );
  })();

  const showBackButton = step !== 'done';

  const contentBody = (
    <>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_42%)]' />
      <div className='absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(237,153,98,0.18),transparent_68%)]' />

      <div
        className={cn(
          'relative mx-auto flex w-full max-w-[430px] flex-col px-6',
          presentation === 'overlay'
            ? 'h-full pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),18px)]'
            : 'min-h-[640px] pb-8 pt-6'
        )}
      >
        <header className='flex items-center justify-between pb-6'>
          {showBackButton &&
          (step !== 'intro' || presentation === 'overlay') ? (
            <button
              type='button'
              onClick={onBack}
              className='inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/78 transition-colors duration-200 hover:bg-white/[0.08]'
              aria-label={step === 'intro' ? 'Close' : 'Back'}
            >
              <ChevronLeft className='h-5 w-5' />
            </button>
          ) : (
            <span className='h-10 w-10' aria-hidden='true' />
          )}

          <span
            className={cn(
              'text-[13px] font-medium tracking-[-0.01em] text-white/36 opacity-0'
            )}
          >
            .
          </span>
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

  const sharedContentProps = {
    className: cn(
      presentation === 'overlay'
        ? 'pointer-events-auto fixed inset-0 z-[140] bg-[#0a0b0f]'
        : 'relative min-h-[640px] rounded-[32px] bg-[#0a0b0f]',
      'text-white'
    ),
    'data-testid': 'profile-mobile-notifications-flow',
    style: {
      '--mobile-flow-accent': accentHex,
    } as CSSProperties,
  };

  const content =
    presentation === 'overlay' ? (
      <div {...sharedContentProps} role='dialog' aria-modal='true'>
        {contentBody}
      </div>
    ) : (
      <div {...sharedContentProps}>{contentBody}</div>
    );

  if (presentation === 'inline') {
    return content;
  }

  return createPortal(content, document.body);
}
