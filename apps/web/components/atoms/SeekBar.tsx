'use client';

import { useMemo } from 'react';
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
  const progressPercent =
    duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

  const seekStyle = useMemo(
    () => ({ '--seek-pct': `${progressPercent}%` }) as React.CSSProperties,
    [progressPercent]
  );

  return (
    <input
      type='range'
      min={0}
      max={duration > 0 ? duration : 1}
      step='any'
      value={currentTime}
      onChange={event => {
        onSeek(Number(event.target.value));
      }}
      aria-label='Seek track'
      disabled={disabled}
      className={cn(
        'seek-range cursor-pointer appearance-none rounded-full accent-(--linear-accent) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--linear-border-focus) disabled:cursor-default disabled:opacity-50',
        className
      )}
      style={seekStyle}
    />
  );
}
