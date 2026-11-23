import { Play } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

const PLAY_ICON_SIZE = {
  12: 'h-3 w-3',
  14: 'h-3.5 w-3.5',
  16: 'h-4 w-4',
} as const;

export type PlayIconSize = keyof typeof PLAY_ICON_SIZE;

export interface PlayIconProps extends ComponentPropsWithoutRef<typeof Play> {
  readonly size?: PlayIconSize;
}

/**
 * Play triangle with its optical offset. Lucide's triangle has its centroid
 * 5.6% left of the box centre, which rounds to 1px at 12, 14 and 16px. Call
 * sites never add their own translate; the play-icon contract test enforces it.
 */
export function PlayIcon({ size = 14, className, ...props }: PlayIconProps) {
  return (
    <Play
      aria-hidden='true'
      {...props}
      className={cn(PLAY_ICON_SIZE[size], 'translate-x-px', className)}
    />
  );
}
