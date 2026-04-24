'use client';

import {
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { AlertCircle, CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useUpdateSubscriberNameMutation } from '@/lib/queries/useNotificationStatusQuery';
import { cn } from '@/lib/utils';
import type { NotificationSubscriptionState } from '@/types/notifications';
import type { SubscriptionErrorOrigin } from './useSubscriptionForm';

/** Prevents synthetic font weight rendering for better typography */
export const noFontSynthesisStyle: CSSProperties = {
  fontSynthesisWeight: 'none',
};

export const subscriptionHeadingClassName =
  'text-balance text-center text-[1.55rem] font-[640] tracking-[-0.045em] text-primary-token sm:text-[1.8rem]';

export const subscriptionDisclaimerClassName =
  'text-center text-xs leading-5 font-normal tracking-[-0.01em] text-muted-foreground/80';

export const profilePrimaryPillClassName =
  'inline-flex h-12 items-center justify-center rounded-full border border-transparent bg-[var(--profile-pearl-primary-bg)] px-5 text-mid font-[590] tracking-[-0.018em] text-[var(--profile-pearl-primary-fg)] shadow-[0_10px_24px_rgba(0,0,0,0.16)] transition-[background-color,color,opacity,box-shadow,border-color] duration-200 ease-out hover:opacity-[0.96] hover:shadow-[0_12px_28px_rgba(0,0,0,0.18)] active:opacity-[0.9] disabled:cursor-not-allowed disabled:opacity-50 focus-ring-themed';

/** Pearl-Notify hero morph-bar CTA pill — glassy dark, sits over the hero image. */
export const profileHeroMorphPillClassName =
  'inline-flex h-11 items-center justify-center rounded-full border border-white/14 bg-white/10 px-5 text-[13.5px] font-semibold tracking-[-0.01em] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_6px_16px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[background-color,color,opacity,box-shadow] duration-200 ease-out hover:bg-white/14 active:opacity-[0.9] disabled:cursor-not-allowed disabled:opacity-50 focus-ring-themed';

export const profileSecondaryPillClassName =
  'inline-flex h-12 items-center justify-center rounded-full border border-[color:var(--profile-pearl-border)] bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_92%,transparent)] px-5 text-mid font-[580] tracking-[-0.018em] text-primary-token shadow-[0_10px_24px_rgba(10,12,18,0.08)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out hover:bg-[var(--profile-pearl-bg-hover)] hover:border-[color:var(--profile-pearl-border)] hover:shadow-[0_14px_28px_rgba(10,12,18,0.1)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 focus-ring-themed';

export const profileQuietIconButtonClassName =
  'border-transparent bg-transparent text-white/72 shadow-none hover:border-[color:var(--profile-pearl-border)] hover:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_86%,transparent)] hover:text-white focus-visible:border-[color:var(--profile-pearl-border)] focus-visible:bg-[color:color-mix(in_srgb,var(--profile-pearl-bg)_90%,transparent)] focus-visible:text-white active:bg-[var(--profile-pearl-bg-active)] active:text-white';

export const subscriptionComposerSurfaceClassName =
  'rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] shadow-[0_10px_22px_rgba(15,17,24,0.08)] backdrop-blur-2xl transition-[background-color,border-color,box-shadow] duration-slow ease-out dark:shadow-[0_10px_24px_rgba(0,0,0,0.18)]';

export const subscriptionComposerFocusClassName =
  'border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-hover)] shadow-[0_14px_30px_rgba(15,17,24,0.12)] dark:bg-[var(--profile-pearl-bg-hover)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)]';

/** Hero morph-bar surface — matches the glassy-dark collapsed pill so every
 * step (email/OTP/name/birthday/done) shares the exact same shell. */
export const subscriptionHeroComposerSurfaceClassName =
  'rounded-full border border-white/14 bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14),0_6px_16px_rgba(0,0,0,0.22)] backdrop-blur-xl transition-[background-color,border-color,box-shadow] duration-200 ease-out';

export const subscriptionHeroComposerFocusClassName =
  'border-white/22 bg-white/14 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.22),0_8px_22px_rgba(0,0,0,0.28)]';

export const subscriptionInputClassName =
  'h-12 w-full bg-transparent px-2 text-mid font-[590] tracking-[-0.02em] text-primary-token placeholder:text-tertiary-token placeholder:opacity-80 transition-[color,opacity] duration-slow focus-visible:outline-none focus-visible:ring-0';

export const subscriptionHeroInputClassName =
  'h-11 w-full bg-transparent px-2 text-[13.5px] font-semibold tracking-[-0.01em] text-white placeholder:text-white/45 focus-visible:outline-none focus-visible:ring-0';

/** Hero morph-bar circular submit button — 36×36 inverted-white to match the
 * white Play button beside the pill, while staying inside the 44px shell. */
export const subscriptionHeroSubmitClassName =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-[0_4px_12px_rgba(0,0,0,0.22)] transition-[transform,opacity] duration-150 hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white';

export const subscriptionPrimaryActionClassName = `${profilePrimaryPillClassName} shrink-0`;

export const subscriptionMutedActionClassName = `${profileSecondaryPillClassName} h-10 shrink-0 px-4`;

export const subscriptionPrimaryLinkClassName = cn(
  subscriptionPrimaryActionClassName,
  'h-12 w-full justify-center px-6'
);

export const subscriptionFeedbackRailClassName =
  'flex min-h-5 items-center justify-between gap-2 px-1';

export const subscriptionFeedbackCopyClassName =
  'text-[11px] leading-4 tracking-[-0.01em] text-secondary-token/68';

export const subscriptionErrorTextClassName =
  'text-xs leading-4 tracking-[-0.012em] text-red-400';

export const subscriptionSuccessTextClassName =
  'text-xs leading-4 tracking-[-0.012em] text-emerald-400';

export const subscriptionDesktopErrorAffordanceClassName =
  'inline-flex items-center gap-1.5 text-red-400';

interface UseSubscriptionErrorFeedbackOptions {
  readonly error: string | null;
  readonly errorOrigin: SubscriptionErrorOrigin;
}

interface SubscriptionPearlComposerProps {
  readonly leftSlot?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly layout?: 'inline' | 'stacked';
  readonly className?: string;
  readonly dataTestId?: string;
  /** 'hero' renders the glassy-dark morph-bar surface used in the hero CTA. */
  readonly tone?: 'default' | 'hero';
}

interface SubscriptionFeedbackRailProps {
  readonly message?: ReactNode;
  readonly sideAction?: ReactNode;
  readonly messageClassName?: string;
}

interface SubscriptionOtpResendActionProps {
  readonly resendCooldownEnd: number;
  readonly isResending: boolean;
  readonly onResend: () => void;
}

interface OtpResendConfirmationOptions {
  readonly handleResendOtp: () => Promise<boolean>;
  readonly confirmTimeoutRef: MutableRefObject<ReturnType<
    typeof setTimeout
  > | null>;
  readonly setConfirmMessage: Dispatch<SetStateAction<string | null>>;
}

export function clearOtpConfirmTimeout(
  confirmTimeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>
) {
  const confirmTimeout = confirmTimeoutRef.current;
  if (confirmTimeout) {
    clearTimeout(confirmTimeout);
    confirmTimeoutRef.current = null;
  }
}

export function requestOtpResendConfirmation({
  handleResendOtp,
  confirmTimeoutRef,
  setConfirmMessage,
}: OtpResendConfirmationOptions) {
  void handleResendOtp().then(didResend => {
    if (!didResend) {
      return;
    }

    setConfirmMessage('Code sent!');
    clearOtpConfirmTimeout(confirmTimeoutRef);
    confirmTimeoutRef.current = setTimeout(() => setConfirmMessage(null), 2000);
  });
}

export function SubscriptionPearlComposer({
  leftSlot,
  children,
  action,
  layout = 'inline',
  className,
  dataTestId,
  tone = 'default',
}: SubscriptionPearlComposerProps) {
  const stacked = layout === 'stacked';
  if (process.env.NODE_ENV !== 'production' && tone === 'hero' && stacked) {
    console.warn(
      '[SubscriptionPearlComposer] tone="hero" is only supported with inline layout. ' +
        'The stacked layout will render without the 44px hero shell.'
    );
  }
  const surfaceClass =
    tone === 'hero'
      ? subscriptionHeroComposerSurfaceClassName
      : subscriptionComposerSurfaceClassName;

  const heroInline = tone === 'hero' && !stacked;

  return (
    <div
      className={cn(
        surfaceClass,
        stacked ? 'rounded-[2rem] p-3' : 'px-1',
        heroInline ? 'h-11' : '',
        className
      )}
      data-testid={dataTestId}
      data-tone={tone}
    >
      <div
        className={cn(
          'min-w-0',
          stacked ? 'space-y-3' : 'flex items-center gap-2'
        )}
      >
        {leftSlot ? (
          <div
            className={cn(
              'shrink-0',
              stacked ? 'flex items-center' : 'flex items-center self-stretch'
            )}
          >
            {leftSlot}
          </div>
        ) : null}
        <div className={cn('min-w-0', stacked ? '' : 'flex-1')}>{children}</div>
        {action ? (
          <div
            className={cn(
              'shrink-0',
              stacked ? 'flex justify-end' : 'flex items-center'
            )}
          >
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SubscriptionFeedbackRail({
  message,
  sideAction,
  messageClassName,
}: SubscriptionFeedbackRailProps) {
  return (
    <div className={subscriptionFeedbackRailClassName}>
      <div
        className={cn(
          'min-w-0 flex-1',
          subscriptionFeedbackCopyClassName,
          message ? 'opacity-100' : 'opacity-0',
          messageClassName
        )}
      >
        {message ?? <span aria-hidden='true'>.</span>}
      </div>
      {sideAction ? <div className='shrink-0'>{sideAction}</div> : null}
    </div>
  );
}

export function useSubscriptionErrorFeedback({
  error,
  errorOrigin,
}: UseSubscriptionErrorFeedbackOptions) {
  const isDesktop = useBreakpoint('md');
  const { error: showError } = useNotifications();
  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!error) {
      lastToastKeyRef.current = null;
      return;
    }

    if (!isDesktop || !errorOrigin || errorOrigin === 'blur') {
      return;
    }

    const toastKey = `${errorOrigin}:${error}`;
    if (lastToastKeyRef.current === toastKey) {
      return;
    }

    lastToastKeyRef.current = toastKey;
    showError(error);
  }, [error, errorOrigin, isDesktop, showError]);

  return {
    isDesktop,
    showInlineErrorCopy: !isDesktop,
    shouldShowDesktopTooltip:
      Boolean(error) && isDesktop && errorOrigin !== 'blur',
  };
}

export function SubscriptionDesktopErrorIndicator({
  error,
}: Readonly<{
  error: string;
}>) {
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip defaultOpen>
        <TooltipTrigger asChild>
          <span
            className={subscriptionDesktopErrorAffordanceClassName}
            role='alert'
            aria-live='assertive'
          >
            <AlertCircle className='h-3.5 w-3.5' aria-hidden='true' />
            <span className='sr-only'>{error}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent
          side='bottom'
          className='max-w-[280px] border-red-500/20 bg-red-950/90 text-red-200'
        >
          {error}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function SubscriptionOtpResendAction({
  resendCooldownEnd,
  isResending,
  onResend,
}: SubscriptionOtpResendActionProps) {
  const [now, setNow] = useState(Date.now());
  const remaining = Math.max(0, Math.ceil((resendCooldownEnd - now) / 1000));
  const canResend = remaining === 0 && !isResending;

  useEffect(() => {
    if (resendCooldownEnd <= Date.now()) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [resendCooldownEnd]);

  if (canResend) {
    return (
      <button
        type='button'
        className='text-[11px] leading-4 text-primary-token/72 underline underline-offset-2 transition-colors hover:text-primary-token'
        onClick={onResend}
      >
        Resend code
      </button>
    );
  }

  if (isResending) {
    return (
      <span className='text-[11px] leading-4 text-secondary-token/55'>
        Sending...
      </span>
    );
  }

  return (
    <span className='text-[11px] leading-4 text-secondary-token/55'>
      Resend in 0:{remaining.toString().padStart(2, '0')}
    </span>
  );
}

/**
 * Loading skeleton - shown during hydration while checking subscription status
 */
export function SubscriptionFormSkeleton() {
  return (
    <output className='block space-y-3' aria-busy='true'>
      <span className='sr-only'>Loading subscription form</span>
      <Skeleton className='h-14 w-full rounded-[2rem]' />
      {/* Disclaimer area skeleton - fixed height to prevent layout shift */}
      <div className='h-4' />
    </output>
  );
}

function getChannelLabel(
  subscribedChannels?: NotificationSubscriptionState
): string {
  const hasEmail = Boolean(subscribedChannels?.email);
  const hasSms = Boolean(subscribedChannels?.sms);

  if (hasEmail && hasSms) return 'Email & SMS notifications on';
  if (hasEmail) return 'Email notifications on';
  if (hasSms) return 'SMS notifications on';
  return 'Notifications on';
}

type NameCapturePhase = 'ask' | 'saving' | 'saved' | 'skipped';

/**
 * Success state - shown when user has subscribed.
 * Includes optional name capture flow with animated transitions.
 */
export function SubscriptionSuccess({
  artistName,
  handle,
  subscribedChannels,
  artistId,
  subscriberEmail,
}: Readonly<{
  artistName: string;
  handle?: string;
  subscribedChannels?: NotificationSubscriptionState;
  artistId?: string;
  subscriberEmail?: string;
}>) {
  const channelLabel = getChannelLabel(subscribedChannels);
  const [phase, setPhase] = useState<NameCapturePhase>('ask');
  const [nameInput, setNameInput] = useState('');
  const [savedName, setSavedName] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nameMutation = useUpdateSubscriberNameMutation();

  const canCaptureName = Boolean(artistId && subscriberEmail);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => setIsVisible(true), 100);
    return () => globalThis.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (canCaptureName && phase === 'ask') {
      track('name_capture_shown', { handle, source: 'profile_inline' });
    }
  }, [canCaptureName, phase, handle]);

  useEffect(() => {
    if (canCaptureName && phase === 'ask' && isVisible) {
      const timer = globalThis.setTimeout(
        () => inputRef.current?.focus({ preventScroll: true }),
        300
      );
      return () => globalThis.clearTimeout(timer);
    }
  }, [canCaptureName, phase, isVisible]);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || !artistId || !subscriberEmail) return;

    setPhase('saving');
    try {
      await nameMutation.mutateAsync({
        artistId,
        email: subscriberEmail,
        name: trimmed,
      });
      setSavedName(trimmed);
      setPhase('saved');
      track('name_capture_submitted', { handle, source: 'profile_inline' });
    } catch {
      // Name capture is best-effort — don't block the success flow
      setPhase('saved');
      setSavedName(trimmed);
    }
  }, [nameInput, artistId, subscriberEmail, handle, nameMutation]);

  const handleSkip = useCallback(() => {
    setPhase('skipped');
    track('name_capture_skipped', { handle, source: 'profile_inline' });
  }, [handle]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleSaveName();
      }
    },
    [handleSaveName]
  );

  // Show name capture flow for email subscribers
  if (canCaptureName && (phase === 'ask' || phase === 'saving')) {
    return (
      <div
        className={`space-y-3 transition-all duration-slower ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      >
        <p className='flex items-center justify-center gap-1.5 text-sm text-secondary-token'>
          <CheckCircle2
            className='h-4 w-4 shrink-0 text-green-600 dark:text-green-400'
            aria-hidden='true'
          />
          <span>{channelLabel}</span>
        </p>

        <p
          className='text-center text-[13px] font-[590] tracking-[-0.015em] text-primary-token/88'
          style={noFontSynthesisStyle}
        >
          What should we call you?
        </p>

        <SubscriptionPearlComposer
          action={
            <button
              type='button'
              onClick={() => {
                handleSaveName();
              }}
              disabled={phase === 'saving' || !nameInput.trim()}
              className={subscriptionPrimaryActionClassName}
              style={noFontSynthesisStyle}
            >
              {phase === 'saving' ? 'Saving…' : 'Save'}
            </button>
          }
        >
          <input
            ref={inputRef}
            type='text'
            className={subscriptionInputClassName}
            placeholder='First name'
            value={nameInput}
            onChange={event => setNameInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={phase === 'saving'}
            maxLength={100}
            autoComplete='given-name'
            style={noFontSynthesisStyle}
          />
        </SubscriptionPearlComposer>

        <button
          type='button'
          onClick={handleSkip}
          disabled={phase === 'saving'}
          className='w-full text-center text-xs text-secondary-token/70 hover:text-secondary-token transition-colors'
          style={noFontSynthesisStyle}
        >
          Skip
        </button>
      </div>
    );
  }

  // Personalized success (name was saved)
  if (phase === 'saved' && savedName) {
    return (
      <div className='space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-slower'>
        <p className='flex items-center justify-center gap-1.5 text-sm text-secondary-token'>
          <CheckCircle2
            className='h-4 w-4 shrink-0 text-green-600 dark:text-green-400'
            aria-hidden='true'
          />
          <span>Thanks, {savedName}!</span>
        </p>
        {handle ? (
          <Link
            href={`/${handle}?mode=listen`}
            prefetch={false}
            className={subscriptionPrimaryLinkClassName}
          >
            Listen Now
          </Link>
        ) : null}
      </div>
    );
  }

  // Default success (skipped or no name capture)
  return (
    <div
      className={`space-y-3 ${phase === 'skipped' ? 'animate-in fade-in duration-slower' : ''}`}
    >
      <p className='flex items-center justify-center gap-1.5 text-sm text-secondary-token'>
        <CheckCircle2
          className='h-4 w-4 shrink-0 text-green-600 dark:text-green-400'
          aria-hidden='true'
        />
        <span>{channelLabel}</span>
      </p>
      {handle ? (
        <Link
          href={`/${handle}?mode=listen`}
          prefetch={false}
          className={subscriptionPrimaryLinkClassName}
        >
          Listen Now
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Pending confirmation state - shown when an OTP email was sent and the
 * verification UI is rendered elsewhere.
 */
export function SubscriptionPendingConfirmation() {
  return (
    <div className='space-y-2'>
      <div
        className={cn(
          subscriptionComposerSurfaceClassName,
          'inline-flex w-full items-center justify-center gap-2 px-5 py-4 text-primary-token'
        )}
      >
        <Mail className='h-5 w-5 text-primary-token/72' aria-hidden='true' />
        <span className='text-mid font-semibold tracking-[-0.015em]'>
          Check your inbox
        </span>
      </div>
      <p className={subscriptionDisclaimerClassName}>
        Enter the 6-digit code from your email to turn on notifications from
        this artist.
      </p>
    </div>
  );
}
