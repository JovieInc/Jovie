'use client';

import { Skeleton } from '@jovie/ui';
import { CheckCircle2, Mail } from 'lucide-react';
import Link from 'next/link';
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { track } from '@/lib/analytics';
import { useUpdateSubscriberNameMutation } from '@/lib/queries/useNotificationStatusQuery';
import { cn } from '@/lib/utils';
import type { NotificationSubscriptionState } from '@/types/notifications';

/** Prevents synthetic font weight rendering for better typography */
export const noFontSynthesisStyle: CSSProperties = {
  fontSynthesisWeight: 'none',
};

export const subscriptionHeadingClassName =
  'text-balance text-center text-[1.55rem] font-[640] tracking-[-0.045em] text-primary-token sm:text-[1.8rem]';

export const subscriptionDisclaimerClassName =
  'text-center text-[12px] leading-5 font-normal tracking-[-0.01em] text-muted-foreground/80';

export const subscriptionComposerSurfaceClassName =
  'rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] shadow-[0_8px_20px_rgba(15,17,24,0.06)] backdrop-blur-2xl transition-[background-color,border-color,box-shadow] duration-200 ease-out dark:shadow-[0_10px_24px_rgba(0,0,0,0.18)]';

export const subscriptionComposerFocusClassName =
  'border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg-hover)] shadow-[0_10px_24px_rgba(15,17,24,0.08)] dark:bg-[var(--profile-pearl-bg-hover)] dark:shadow-[0_12px_28px_rgba(0,0,0,0.22)]';

export const subscriptionInputClassName =
  'h-12 w-full bg-transparent px-2 text-[15px] font-[560] tracking-[-0.02em] text-primary-token placeholder:text-tertiary-token placeholder:opacity-80 transition-[color,opacity] duration-200 focus-visible:outline-none focus-visible:ring-0';

export const subscriptionPrimaryActionClassName =
  'inline-flex h-12 shrink-0 items-center justify-center rounded-full border border-transparent bg-[var(--profile-pearl-primary-bg)] px-5 text-[15px] font-semibold tracking-[-0.015em] text-[var(--profile-pearl-primary-fg)] shadow-none transition-[background-color,color,opacity] duration-200 ease-out hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-50 focus-ring-themed';

export const subscriptionMutedActionClassName =
  'inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--profile-pearl-border)] bg-[var(--profile-pearl-bg)] px-4 text-[15px] font-[560] tracking-[-0.015em] text-primary-token shadow-[var(--profile-pearl-shadow)] transition-[background-color,opacity,transform] duration-150 hover:bg-[var(--profile-pearl-bg-hover)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 focus-ring-themed';

export const subscriptionPrimaryLinkClassName = cn(
  subscriptionPrimaryActionClassName,
  'h-12 w-full justify-center px-6'
);

interface SubscriptionPearlComposerProps {
  readonly leftSlot?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly action?: React.ReactNode;
  readonly layout?: 'inline' | 'stacked';
  readonly className?: string;
  readonly dataTestId?: string;
}

export function SubscriptionPearlComposer({
  leftSlot,
  children,
  action,
  layout = 'inline',
  className,
  dataTestId,
}: SubscriptionPearlComposerProps) {
  const stacked = layout === 'stacked';

  return (
    <div
      className={cn(
        subscriptionComposerSurfaceClassName,
        stacked ? 'rounded-[2rem] p-3' : 'px-1',
        className
      )}
      data-testid={dataTestId}
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
        className={`space-y-3 transition-all duration-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
      >
        <p className='flex items-center justify-center gap-1.5 text-sm text-secondary-token'>
          <CheckCircle2
            className='h-4 w-4 shrink-0 text-green-600 dark:text-green-400'
            aria-hidden='true'
          />
          <span>{channelLabel}</span>
        </p>

        <p
          className='text-center text-[13px] font-[560] tracking-[-0.015em] text-primary-token/88'
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
          className='w-full text-center text-[12px] text-secondary-token/70 hover:text-secondary-token transition-colors'
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
      <div className='space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300'>
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
            prefetch
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
      className={`space-y-3 ${phase === 'skipped' ? 'animate-in fade-in duration-300' : ''}`}
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
          prefetch
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
        <span className='text-[15px] font-semibold tracking-[-0.015em]'>
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
