import { Badge } from '@jovie/ui';
import { cn } from '@/lib/utils';

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
} as const;

const STATUS_BADGE_SIZE_CLASSES = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
} as const;

export type StatusBadgeVariant = keyof typeof STATUS_BADGE_TONES;
export type StatusBadgeSize = keyof typeof STATUS_BADGE_SIZES;

export interface StatusBadgeProps {
  /** Badge text content */
  readonly children: React.ReactNode;
  /** Color variant for the badge */
  readonly variant?: StatusBadgeVariant;
  /** Optional icon to display before text */
  readonly icon?: React.ReactNode;
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
      className={cn(
        'gap-2 font-medium',
        STATUS_BADGE_SIZE_CLASSES[size],
        className
      )}
    >
      {icon && <span className='shrink-0'>{icon}</span>}
      <span>{children}</span>
    </Badge>
  );
}
