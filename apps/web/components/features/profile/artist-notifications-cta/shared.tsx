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
import { useUpdateSubscriberNameMutation } from '@/lib/queries';
import type { NotificationSubscriptionState } from '@/types/notifications';

/** Prevents synthetic font weight rendering for better typography */
export const noFontSynthesisStyle: CSSProperties = {
  fontSynthesisWeight: 'none',
};

/**
 * Loading skeleton - shown during hydration while checking subscription status
 */
export function SubscriptionFormSkeleton() {
  return (
    <output className='block space-y-3' aria-busy='true'>
      <span className='sr-only'>Loading subscription form</span>
      {/* Input area skeleton */}
      <Skeleton className='h-12 w-full rounded-2xl' />
      {/* Button skeleton */}
      <Skeleton className='h-11 w-full rounded-md' />
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
          className='text-center text-[13px] font-[550] tracking-[0.01em] text-primary-token/88'
          style={noFontSynthesisStyle}
        >
          What should we call you?
        </p>

        <div className='overflow-hidden rounded-xl bg-transparent ring-1 ring-(--color-border-subtle) transition-[ring,background-color] focus-within:bg-surface-1/30 focus-within:ring-2 focus-within:ring-[rgb(var(--focus-ring))]'>
          <input
            ref={inputRef}
            type='text'
            className='h-12 w-full border-none bg-transparent px-4 text-[15px] text-primary-token placeholder:text-tertiary-token placeholder:opacity-80 focus-visible:outline-none focus-visible:ring-0'
            placeholder='First name'
            value={nameInput}
            onChange={event => setNameInput(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={phase === 'saving'}
            maxLength={100}
            autoComplete='given-name'
            style={noFontSynthesisStyle}
          />
        </div>

        <button
          type='button'
          onClick={() => {
            handleSaveName();
          }}
          disabled={phase === 'saving' || !nameInput.trim()}
          className='inline-flex h-12 w-full items-center justify-center rounded-xl border border-white/10 bg-white text-base font-semibold text-black transition-[opacity,background-color,border-color] duration-150 hover:border-white/20 hover:bg-white/96 disabled:cursor-not-allowed disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-2 focus-visible:ring-offset-(--color-bg-base)'
          style={noFontSynthesisStyle}
        >
          {phase === 'saving' ? 'Saving...' : 'Save & Listen Now'}
        </button>

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
            className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl bg-btn-primary text-btn-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:opacity-95 focus-ring-transparent-offset'
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
          className='inline-flex items-center justify-center w-full px-8 py-4 text-lg font-semibold rounded-xl bg-btn-primary text-btn-primary-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:opacity-95 focus-ring-transparent-offset'
        >
          Listen Now
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Pending confirmation state - shown when double opt-in email was sent
 */
export function SubscriptionPendingConfirmation() {
  return (
    <div className='space-y-1'>
      <div className='inline-flex items-center justify-center w-full px-8 py-4 rounded-xl bg-surface-2 text-primary-token shadow-sm transition-colors duration-200'>
        <Mail className='w-5 h-5 mr-2 text-accent-bright' aria-hidden='true' />
        <span className='font-semibold'>Check your email</span>
      </div>
      <p className='text-xs text-center text-secondary-token'>
        We sent a confirmation link to your email. Click it to turn on
        notifications from this artist.
      </p>
    </div>
  );
}
