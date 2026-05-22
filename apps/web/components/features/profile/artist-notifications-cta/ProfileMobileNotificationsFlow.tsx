'use client';

import { Switch } from '@jovie/ui';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  Mail,
  Music2,
  Shirt,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { OtpInput } from '@/features/auth/atoms/otp-input';
import { PROFILE_Z } from '@/lib/profile/z-index-constants';
import { cn } from '@/lib/utils';
import type { NotificationContentType } from '@/types/notifications';

export type ProfileMobileNotificationsFlowStep =
  | 'email'
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
  readonly canEditPreferences?: boolean;
  readonly canGoBackFromPreferences?: boolean;
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

const CURRENT_YEAR = new Date().getFullYear();

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
      <div className='space-y-2 pb-6 pt-2'>
        <h2 className='text-[24px] font-semibold leading-[1.06] tracking-normal text-white'>
          {title}
        </h2>
        {body ? (
          <p className='max-w-[24rem] text-[14px] leading-5 text-white/58'>
            {body}
          </p>
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
      className='inline-flex h-12 w-full items-center justify-center rounded-[var(--profile-action-radius)] bg-white/14 px-5 text-[14px] font-semibold tracking-[-0.01em] text-white transition-colors duration-subtle hover:bg-white/18 disabled:cursor-not-allowed disabled:opacity-60'
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
      className='inline-flex h-10 w-full items-center justify-center rounded-[var(--profile-action-radius)] px-5 text-[13px] font-medium tracking-[-0.005em] text-white/58 transition-colors duration-subtle hover:text-white/76 disabled:cursor-not-allowed disabled:opacity-60'
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
        className='h-12 w-full touch-manipulation rounded-[var(--profile-action-radius)] border border-white/10 bg-white/[0.03] px-3.5 text-[16px] font-medium tracking-[-0.005em] text-white placeholder:text-white/28 focus:border-white/18 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
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
  const yearOptions = useMemo(
    () => Array.from({ length: 100 }, (_, index) => CURRENT_YEAR - index),
    []
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
          className='h-12 w-full touch-manipulation appearance-none rounded-[var(--profile-action-radius)] border border-white/10 bg-white/[0.03] px-3 text-[16px] font-medium tracking-[-0.005em] text-white focus:border-white/18 focus:outline-none'
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
          className='h-12 w-full touch-manipulation appearance-none rounded-[var(--profile-action-radius)] border border-white/10 bg-white/[0.03] px-3 text-[16px] font-medium tracking-[-0.005em] text-white focus:border-white/18 focus:outline-none'
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
          className='h-12 w-full touch-manipulation appearance-none rounded-[var(--profile-action-radius)] border border-white/10 bg-white/[0.03] px-3 text-[16px] font-medium tracking-[-0.005em] text-white focus:border-white/18 focus:outline-none'
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
  portalContainer,
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
  canEditPreferences = false,
  canGoBackFromPreferences = false,
  artistEmailOptIn = false,
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
      return (
        <ScreenShell
          title={channel === 'sms' ? 'Text Alerts' : 'Email Alerts'}
          body={`We'll send ${artistName} alerts here.`}
          footer={
            <div className='space-y-3'>
              {error ? (
                <p className='text-sm text-red-400' role='alert'>
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
          body={`Verify your ${channel === 'sms' ? 'phone' : 'email'} to activate ${artistName} alerts.`}
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
          <div className='rounded-[24px] border border-white/10 bg-white/[0.03] p-4'>
            <OtpInput
              value={otpCode}
              onChange={onOtpChange}
              onComplete={onOtpComplete}
              autoFocus={step === 'otp'}
              aria-label='Enter 6-digit verification code'
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
          body='Choose what to receive.'
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
              <div className='space-y-1'>
                <p
                  className='text-[13px] font-semibold tracking-[-0.01em] text-white/42'
                  data-testid='profile-mobile-notifications-sent-from'
                >
                  Sent from Jovie
                </p>
                <p className='text-[14px] leading-5 text-white/58'>
                  Jovie sends verified release and show alerts to your{' '}
                  {channel === 'sms' ? 'phone' : 'email'}.
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
                          <Icon className='size-4.5' />
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
                    <p className='text-[14px] leading-5 text-white/58'>
                      Share your email with {artistName} for occasional artist
                      emails.
                    </p>
                  </div>

                  <div className='flex items-center justify-between gap-4 py-2'>
                    <div className='flex items-center gap-3'>
                      <span className='inline-flex h-8 w-8 items-center justify-center text-white/68'>
                        <Mail className='size-4.5' />
                      </span>
                      <div>
                        <p className='text-[15px] font-medium tracking-[-0.015em] text-white/88'>
                          Artist Emails
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={artistEmailOptIn}
                      onCheckedChange={checked =>
                        onArtistEmailToggle?.(checked)
                      }
                      aria-label='Artist emails'
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
            <Check className='h-10 w-10 text-white' />
          </div>
        </div>
      </ScreenShell>
    );
  })();

  const isRootPreferencesStep =
    step === 'preferences' && !canGoBackFromPreferences;
  const showBackButton =
    step !== 'done' && (!isRootPreferencesStep || presentation !== 'inline');
  const showCloseButton = presentation === 'modal';

  const contentBody = (
    <>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_42%)]' />
      <div className='absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(237,153,98,0.18),transparent_68%)]' />

      <div
        className={cn(
          'relative mx-auto flex w-full max-w-[430px] flex-col px-5',
          presentation === 'overlay'
            ? 'h-full pb-[max(env(safe-area-inset-bottom),28px)] pt-[max(env(safe-area-inset-top),18px)]'
            : 'h-full pb-8 pt-6'
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
          'bg-[color:var(--profile-stage-bg)] text-white'
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
          'flex items-center justify-center bg-black/52 px-4 py-6 text-white backdrop-blur-sm'
        )}
        data-testid='profile-mobile-notifications-flow'
        role='dialog'
        aria-modal='true'
        style={contentStyle}
      >
        <div className='relative flex h-[min(760px,calc(100dvh-48px))] w-full max-w-[440px] flex-col overflow-hidden rounded-[var(--profile-card-radius)] border border-white/10 bg-[color:var(--profile-stage-bg)] shadow-[0_34px_96px_rgba(0,0,0,0.48)]'>
          {contentBody}
        </div>
      </div>
    ) : (
      <div
        className='relative min-h-[600px] rounded-[var(--profile-card-radius)] bg-[color:var(--profile-stage-bg)] text-white'
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
