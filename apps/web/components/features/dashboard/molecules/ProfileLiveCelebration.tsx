'use client';

import { PartyPopper } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

interface ConfettiParticle {
  id: string;
  width: number;
  height: number;
  color: string;
  left: string;
  opacity: number;
  animationDelay: string;
  animationDuration: string;
  rotation: string;
}

function getSeededValue(index: number, salt: number): number {
  const seed = ((index + 1) * 1664525 + salt * 1013904223) >>> 0;
  return seed / 0x100000000;
}

function generateParticles(): ConfettiParticle[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
    id: `confetti-${crypto.randomUUID()}`,
    width: 4 + getSeededValue(i, 1) * 6,
    height: 4 + getSeededValue(i, 2) * 6,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    left: `${getSeededValue(i, 3) * 100}%`,
    opacity: 0.9,
    animationDelay: `${getSeededValue(i, 4) * 0.8}s`,
    animationDuration: `${2 + getSeededValue(i, 5) * 2}s`,
    rotation: `rotate(${getSeededValue(i, 6) * 360}deg)`,
  }));
}

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
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const continueRef = useRef<HTMLButtonElement | null>(null);
  const hasCompletedRef = useRef(false);
  const hasTrackedRef = useRef(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCompleteRef = useRef(onComplete);
  const profileUrl = `jov.ie/${username}`;
  const particles = useMemo(() => generateParticles(), []);

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
      {/* Confetti particles */}
      <div
        className='pointer-events-none absolute inset-0 overflow-hidden'
        aria-hidden='true'
      >
        {particles.map(p => (
          <span
            key={p.id}
            className='absolute block rounded-sm confetti-particle'
            style={{
              width: `${p.width}px`,
              height: `${p.height}px`,
              backgroundColor: p.color,
              left: p.left,
              top: '-10px',
              opacity: p.opacity,
              animationDelay: p.animationDelay,
              animationDuration: p.animationDuration,
              transform: p.rotation,
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
    </dialog>
  );
}
