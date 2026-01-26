'use client';

/**
 * ReleaseCountdown Component
 *
 * Displays a countdown timer for upcoming releases. Updates every minute
 * to show days, hours, and minutes until release. When the countdown ends,
 * triggers a page refresh to show the released content.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  total: number;
}

/**
 * Calculate time remaining until target date
 */
function getTimeLeft(targetDate: Date): TimeLeft {
  const now = new Date();
  const total = targetDate.getTime() - now.getTime();

  if (total <= 0) {
    return { days: 0, hours: 0, minutes: 0, total: 0 };
  }

  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((total % (1000 * 60 * 60)) / (1000 * 60));

  return { days, hours, minutes, total };
}

interface ReleaseCountdownProps {
  releaseDate: Date;
}

const UPDATE_INTERVAL_MS = 60_000;

export function ReleaseCountdown({ releaseDate }: ReleaseCountdownProps) {
  const router = useRouter();
  // Initialize with null to avoid hydration mismatch (server/client time differences)
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);

  useEffect(() => {
    // Compute initial time on client to avoid hydration mismatch
    const initialTimeLeft = getTimeLeft(releaseDate);
    setTimeLeft(initialTimeLeft);

    // Check immediately in case release time passed during SSR/hydration
    if (initialTimeLeft.total <= 0) {
      router.refresh();
      return;
    }

    const timer = setInterval(() => {
      const newTimeLeft = getTimeLeft(releaseDate);
      setTimeLeft(newTimeLeft);

      // When countdown ends, refresh the page to show released content
      // This ensures users see the correct UI state without manual refresh
      if (newTimeLeft.total <= 0) {
        router.refresh();
      }
    }, UPDATE_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [releaseDate, router]);

  // Don't render until mounted or if release has passed
  if (!timeLeft || timeLeft.total <= 0) {
    return null;
  }

  return (
    <div className='text-center'>
      <p className='text-xs uppercase tracking-widest text-white/40'>
        Drops in
      </p>
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
