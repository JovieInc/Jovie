'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { CopyToClipboardButton } from './CopyToClipboardButton';

interface ProfileLiveCelebrationProps {
  readonly username: string;
  readonly onComplete: () => void;
  /** Auto-advance delay in ms. Defaults to 4000. */
  readonly autoAdvanceMs?: number;
}

const CONFETTI_COUNT = 40;
const CONFETTI_COLORS = [
  'var(--linear-accent)',
  'var(--color-success)',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
];

/**
 * Celebration screen shown after onboarding step 3 completes.
 * Displays CSS confetti + "Your profile is live" with the user's URL.
 * Auto-advances after a delay or on click.
 */
export function ProfileLiveCelebration({
  username,
  onComplete,
  autoAdvanceMs = 4000,
}: ProfileLiveCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileUrl = `jov.ie/${username}`;

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsVisible(true));

    track('onboarding_celebration_shown', { username });

    // Auto-advance
    timerRef.current = setTimeout(onComplete, autoAdvanceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onComplete, autoAdvanceMs, username]);

  const handleClick = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onComplete();
  }, [onComplete]);

  return (
    <div
      className='fixed inset-0 z-50 flex items-center justify-center bg-(--bg)/95 backdrop-blur-sm'
      role='alert'
      aria-live='polite'
    >
      {/* Confetti particles */}
      <div
        className='pointer-events-none absolute inset-0 overflow-hidden'
        aria-hidden='true'
      >
        {Array.from({ length: CONFETTI_COUNT }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative confetti particles never reorder
          <span
            key={`confetti-${i}`}
            className='absolute block rounded-sm confetti-particle'
            style={{
              width: `${4 + Math.random() * 6}px`,
              height: `${4 + Math.random() * 6}px`,
              backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              left: `${Math.random() * 100}%`,
              top: '-10px',
              opacity: 0.9,
              animationDelay: `${Math.random() * 0.8}s`,
              animationDuration: `${2 + Math.random() * 2}s`,
              transform: `rotate(${Math.random() * 360}deg)`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col items-center gap-6 px-6 text-center transition-all duration-700 ease-out ${
          isVisible
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-8 scale-95'
        }`}
      >
        <div className='text-5xl' aria-hidden='true'>
          🎉
        </div>

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
          type='button'
          onClick={handleClick}
          className='mt-2 text-[13px] text-secondary-token hover:text-primary-token transition-colors'
        >
          Continue →
        </button>
      </div>

      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .confetti-particle {
          animation: confetti-fall ease-out forwards;
        }
      `}</style>
    </div>
  );
}
