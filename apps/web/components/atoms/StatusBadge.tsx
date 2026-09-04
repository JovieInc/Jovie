import { Badge, type BadgeProps } from '@jovie/ui';
import type { ReactNode } from 'react';

const STATUS_BADGE_TONES = {
  blue: 'info',
  green: 'success',
  purple: 'accent',
  orange: 'warning',
  red: 'error',
  gray: 'neutral',
} as const;

const STATUS_BADGE_SIZES = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
} as const satisfies Record<string, BadgeProps['size']>;

export type StatusBadgeVariant = keyof typeof STATUS_BADGE_TONES;
export type StatusBadgeSize = keyof typeof STATUS_BADGE_SIZES;

export interface StatusBadgeProps {
  /** Badge text content */
  readonly children: ReactNode;
  /** Color variant for the badge */
  readonly variant?: StatusBadgeVariant;
  /** Optional icon to display before text */
  readonly icon?: ReactNode;
  /** Size variant */
  readonly size?: StatusBadgeSize;
  /** Additional CSS classes */
  readonly className?: string;
  /** Whether the badge communicates dynamic state */
  readonly dynamic?: boolean;
}

export function StatusBadge({
  children,
  variant = 'blue',
  icon,
  size = 'md',
  className,
  dynamic = false,
}: StatusBadgeProps) {
  return (
    <Badge
      role={dynamic ? 'status' : undefined}
      aria-live={dynamic ? 'polite' : undefined}
      tone={STATUS_BADGE_TONES[variant]}
      size={STATUS_BADGE_SIZES[size]}
      className={className}
    >
      {icon && <span className='shrink-0'>{icon}</span>}
      <span className='min-w-0'>{children}</span>
    </Badge>
  );
}
