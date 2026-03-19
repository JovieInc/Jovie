'use client';

import { PartyPopper } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfettiOverlay } from '@/components/atoms/Confetti';
import { track } from '@/lib/analytics';
import { CopyToClipboardButton } from './CopyToClipboardButton';

interface ProfileLiveCelebrationProps {
  readonly username: string;
  readonly profileId?: string;
  readonly onComplete: () => void;
  /** Auto-advance delay in ms. Defaults to 4000. */
  readonly autoAdvanceMs?: number;
}

/**
 * Celebration screen shown when a profile goes live.
 * Displays CSS confetti + "Your profile is live" with the user's URL.
 * Auto-advances after a delay or on click.
 * Uses localStorage to prevent re-firing (celebrated_{profileId}).
 */
export function ProfileLiveCelebration({
  username,
  profileId,
  onComplete,
  autoAdvanceMs = 4000,
}: ProfileLiveCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const hasCompletedRef = useRef(false);
  const hasTrackedRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  const profileUrl = `jov.ie/${username}`;

  // Check localStorage to prevent re-firing celebration
  const celebrationKey = profileId ? `celebrated_${profileId}` : null;
  const alreadyCelebrated = celebrationKey
    ? typeof window !== 'undefined' &&
      window.localStorage.getItem(celebrationKey) !== null
    : false;

  // Mark as celebrated on first render
  useEffect(() => {
    if (celebrationKey && !alreadyCelebrated) {
      window.localStorage.setItem(celebrationKey, String(Date.now()));
    }
  }, [celebrationKey, alreadyCelebrated]);

  // If already celebrated, auto-complete immediately
  useEffect(() => {
    if (alreadyCelebrated) {
      onCompleteRef.current();
    }
  }, [alreadyCelebrated]);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const completeCelebration = useCallback(() => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (dialogRef.current?.open) {
      dialogRef.current.close();
    }

    onCompleteRef.current();
  }, []);

  useEffect(() => {
    hasCompletedRef.current = false;

    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }

    const animationFrame = requestAnimationFrame(() => setIsVisible(true));

    previousFocusRef.current =
      globalThis.document.activeElement instanceof HTMLElement
        ? globalThis.document.activeElement
        : null;

    // Focus the continue button for keyboard/screen-reader users
    continueRef.current?.focus();

    if (!hasTrackedRef.current) {
      track('onboarding_celebration_shown', { username });
      hasTrackedRef.current = true;
    }

    timerRef.current = setTimeout(completeCelebration, autoAdvanceMs);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        completeCelebration();
        return;
      }

      if (event.key !== 'Tab' || !dialog) {
        return;
      }

      const tabbable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter(
        element =>
          !element.hasAttribute('disabled') &&
          element.getAttribute('aria-hidden') !== 'true'
      );

      if (tabbable.length === 0) {
        event.preventDefault();
        continueRef.current?.focus();
        return;
      }

      const first = tabbable[0];
      const last = tabbable[tabbable.length - 1];

      if (event.shiftKey && globalThis.document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        globalThis.document.activeElement === last
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    dialog?.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelAnimationFrame(animationFrame);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      dialog?.removeEventListener('keydown', handleKeyDown);
      if (dialog?.open) {
        dialog.close();
      }
      previousFocusRef.current?.focus();
    };
  }, [autoAdvanceMs, completeCelebration, username]);

  return (
    <dialog
      ref={dialogRef}
      className='fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center border-none bg-(--bg)/95 p-0 backdrop-blur-sm'
      aria-label='Profile live celebration'
    >
      <ConfettiOverlay />

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col items-center gap-6 px-6 text-center transition-all duration-700 ease-out ${
          isVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-8 scale-95'
        }`}
      >
        <PartyPopper
          className='h-12 w-12 text-primary-token'
          aria-hidden='true'
        />

        <h2 className='text-2xl font-semibold tracking-tight text-primary-token'>
          Your profile is live
        </h2>

        <div className='flex items-center gap-2 rounded-xl border border-subtle bg-surface-1 px-4 py-2.5'>
          <span className='text-[15px] font-medium text-primary-token'>
            {profileUrl}
          </span>
          <CopyToClipboardButton
            relativePath={`/${username}`}
            idleLabel='Copy'
            iconName='Copy'
          />
        </div>

        <button
          ref={continueRef}
          type='button'
          onClick={completeCelebration}
          aria-label='Continue to the next step'
          className='mt-2 text-[13px] text-secondary-token transition-colors hover:text-primary-token focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-token focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
        >
          Continue →
        </button>
      </div>

      <style>{`
        dialog::backdrop {
          background: transparent;
        }
      `}</style>
    </dialog>
  );
}
