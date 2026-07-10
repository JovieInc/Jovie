'use client';

import {
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

interface SeekBarProps {
  readonly currentTime: number;
  readonly duration: number;
  readonly onSeek: (time: number) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * Range scrubber with local drag state so the thumb never snaps back to the
 * last throttled engine tick mid-gesture (JOV-3681 smart-link jank fix).
 */
export function SeekBar({
  currentTime,
  duration,
  onSeek,
  disabled = false,
  className,
}: SeekBarProps) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubTime, setScrubTime] = useState(currentTime);

  useEffect(() => {
    if (!isScrubbing) {
      setScrubTime(currentTime);
    }
  }, [currentTime, isScrubbing]);

  const displayTime = isScrubbing ? scrubTime : currentTime;
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (displayTime / duration) * 100))
      : 0;
  const isDisabled = disabled || duration <= 0;

  const commitSeek = useCallback(
    (time: number) => {
      if (!Number.isFinite(time) || duration <= 0) return;
      const clamped = Math.max(0, Math.min(time, duration));
      setScrubTime(clamped);
      onSeek(clamped);
    },
    [duration, onSeek]
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      commitSeek(Number(event.target.value));
    },
    [commitSeek]
  );

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLInputElement>) => {
      if (isDisabled) return;
      setIsScrubbing(true);
      // Capture so pointerup outside the thumb still ends the gesture.
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [isDisabled]
  );

  const endScrub = useCallback(() => {
    setIsScrubbing(false);
  }, []);

  return (
    <input
      type='range'
      min={0}
      max={duration > 0 ? duration : 1}
      step='any'
      value={displayTime}
      onChange={handleChange}
      onPointerDown={handlePointerDown}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onBlur={endScrub}
      aria-label='Seek track'
      aria-valuemin={0}
      aria-valuemax={duration > 0 ? duration : 0}
      aria-valuenow={displayTime}
      disabled={isDisabled}
      className={cn(
        'seek-range cursor-pointer appearance-none rounded-full accent-(--linear-accent) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) disabled:cursor-default disabled:opacity-50',
        className
      )}
      style={
        {
          '--seek-pct': `${progressPercent}%`,
        } as React.CSSProperties
      }
    />
  );
}
