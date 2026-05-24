'use client';

/**
 * ReleaseCountdown Component
 *
 * Displays a countdown timer for upcoming releases. Updates every minute
 * to show days, hours, and minutes until release. When the countdown ends,
 * triggers a page refresh to show the released content.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  total: number;
}

type CompactCountdownSegment = {
  readonly value: number;
  readonly label: 'YR' | 'YRS' | 'D' | 'H' | 'M';
};

/**
 * Calculate time remaining until target date.
 * Returns zero-state for invalid or already-past dates.
 */
function getTimeLeft(targetDate: Date): TimeLeft {
  const targetMs = targetDate.getTime();
  // Treat non-finite timestamps (NaN, ±Infinity) as expired to prevent NaN
  // values propagating into the countdown digits.
  if (!Number.isFinite(targetMs)) {
    return { days: 0, hours: 0, minutes: 0, total: 0 };
  }

  const now = new Date();
  const total = targetMs - now.getTime();

  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, total: 0 };
  }

  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, total };
}

interface ReleaseCountdownProps {
  readonly releaseDate: Date;
  /** Compact inline mode: "Drops in 14d 3h 22m" on one line */
  readonly compact?: boolean;
  /** Label shown above the countdown (default: "Drops in") */
  readonly label?: string;
}

const UPDATE_INTERVAL_MS = 60_000;
const DAYS_PER_YEAR = 365;

export function getCompactCountdownSegments(
  timeLeft: Pick<TimeLeft, 'days' | 'hours' | 'minutes'>
): readonly CompactCountdownSegment[] {
  if (timeLeft.days >= DAYS_PER_YEAR) {
    const years = Math.max(1, Math.floor(timeLeft.days / DAYS_PER_YEAR));
    return [
      {
        value: years,
        label: years === 1 ? 'YR' : 'YRS',
      },
    ];
  }

  return [
    ...(timeLeft.days > 0
      ? [{ value: timeLeft.days, label: 'D' as const }]
      : []),
    { value: timeLeft.hours, label: 'H' },
    { value: timeLeft.minutes, label: 'M' },
  ];
}

export function ReleaseCountdown({
  releaseDate,
  compact = false,
  label = 'Drops in',
}: ReleaseCountdownProps) {
  const router = useRouter();
  // Initialize with null to avoid hydration mismatch (server/client time differences)
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  // Guard to prevent infinite router.refresh() loop when ISR cache returns stale page
  const hasRefreshed = useRef(false);

  useEffect(() => {
    // Compute initial time on client to avoid hydration mismatch
    const initialTimeLeft = getTimeLeft(releaseDate);
    setTimeLeft(initialTimeLeft);

    // Check immediately in case release time passed during SSR/hydration
    if (initialTimeLeft.total <= 0) {
      if (!hasRefreshed.current) {
        hasRefreshed.current = true;
        router.refresh();
      }
      return;
    }

    const timer = setInterval(() => {
      const newTimeLeft = getTimeLeft(releaseDate);
      setTimeLeft(newTimeLeft);

      // When countdown ends, refresh the page to show released content
      // This ensures users see the correct UI state without manual refresh
      if (newTimeLeft.total <= 0) {
        clearInterval(timer);
        if (!hasRefreshed.current) {
          hasRefreshed.current = true;
          router.refresh();
        }
      }
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [releaseDate, router]);

  // Defensive synchronous expiry check: if an ISR-cached parent rendered us
  // with a release date already in the past, render nothing immediately
  // instead of waiting for the next interval tick. The `typeof window` guard
  // preserves SSR-safe hydration (server matches the initial null state).
  const isPastNow =
    typeof window !== 'undefined' && releaseDate.getTime() <= Date.now();

  if (!timeLeft || timeLeft.total <= 0 || isPastNow) {
    return null;
  }

  if (compact) {
    const segments = getCompactCountdownSegments(timeLeft);

    return (
      <div className='flex items-baseline gap-2.5 tabular-nums'>
        {segments.map(segment => (
          <span key={segment.label}>
            <span className='text-[22px] font-[680] tracking-[-0.03em] text-white'>
              {segment.value}
            </span>
            <span className='ml-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/35'>
              {segment.label}
            </span>
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className='text-center'>
      <p className='text-xs uppercase tracking-widest text-white/40'>{label}</p>
      <div className='mt-2 flex items-center justify-center gap-3'>
        {timeLeft.days > 0 && (
          <div className='flex flex-col items-center'>
            <span className='text-2xl font-bold tabular-nums text-white'>
              {timeLeft.days}
            </span>
            <span className='text-[10px] uppercase tracking-wider text-white/40'>
              {timeLeft.days === 1 ? 'day' : 'days'}
            </span>
          </div>
        )}
        <div className='flex flex-col items-center'>
          <span className='text-2xl font-bold tabular-nums text-white'>
            {timeLeft.hours}
          </span>
          <span className='text-[10px] uppercase tracking-wider text-white/40'>
            {timeLeft.hours === 1 ? 'hr' : 'hrs'}
          </span>
        </div>
        <div className='flex flex-col items-center'>
          <span className='text-2xl font-bold tabular-nums text-white'>
            {timeLeft.minutes}
          </span>
          <span className='text-[10px] uppercase tracking-wider text-white/40'>
            min
          </span>
        </div>
      </div>
    </div>
  );
}
