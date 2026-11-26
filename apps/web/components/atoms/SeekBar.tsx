'use client';

import { HostDrawnInput } from '@jovie/ui';
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
    <HostDrawnInput
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
      aria-label='Seek Track'
      disabled={isDisabled}
      className={cn('w-full', className)}
    />
  );
}
