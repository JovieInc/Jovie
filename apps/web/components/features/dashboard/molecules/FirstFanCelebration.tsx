'use client';

import { PartyPopper, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfettiOverlay } from '@/components/atoms/Confetti';
import { track } from '@/lib/analytics';

interface FirstFanCelebrationProps {
  readonly subscriberCount: number;
  readonly userId: string;
}

function getStorageKey(userId: string) {
  return `jovie:first-fan-celebrated:${userId}`;
}

/**
 * Shows a confetti celebration when a creator gets their first fan subscriber.
 * Only shows once per user (tracked via localStorage).
 * Skips if subscriber count > 5 (pre-existing subscribers).
 */
export function FirstFanCelebration({
  subscriberCount,
  userId,
}: FirstFanCelebrationProps) {
  const [show, setShow] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(getStorageKey(userId), '1');
    } catch {
      // ignore
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    setShow(false);
  }, [userId]);

  useEffect(() => {
    // Only celebrate if count is 1-5 (first fan, not pre-existing bulk)
    if (subscriberCount < 1 || subscriberCount > 5) return;

    try {
      const key = getStorageKey(userId);
      if (localStorage.getItem(key)) return;
    } catch {
      return; // SSR or localStorage unavailable
    }

    setShow(true);
  }, [subscriberCount, userId]);

  useEffect(() => {
    if (!show) return;

    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }

    const frame = requestAnimationFrame(() => setIsVisible(true));
    track('first_fan_celebration_shown', { subscriberCount });

    timerRef.current = setTimeout(() => dismiss(), 5000);

    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, dismiss, subscriberCount]);

  if (!show) return null;

  return (
    <dialog
      ref={dialogRef}
      className='fixed inset-0 z-50 m-0 flex h-full w-full max-w-none items-center justify-center border-none bg-(--bg)/95 p-0 backdrop-blur-sm'
      aria-label='First fan celebration'
    >
      <ConfettiOverlay />

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col items-center gap-5 px-6 text-center transition-all duration-700 ease-out ${
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
          Your first fan just subscribed!
        </h2>

        <p className='max-w-sm text-secondary-token'>
          Someone signed up to hear from you. Share your profile to keep
          growing.
        </p>

        <button
          type='button'
          onClick={dismiss}
          className='mt-2 inline-flex items-center gap-1.5 rounded-lg bg-surface-1 px-4 py-2 text-sm font-medium text-primary-token transition-colors hover:bg-surface-2'
        >
          <Users className='h-4 w-4' aria-hidden='true' />
          View your audience
        </button>

        <button
          type='button'
          onClick={dismiss}
          className='text-xs text-tertiary-token transition-colors hover:text-secondary-token'
        >
          Dismiss
        </button>
      </div>
    </dialog>
  );
}
