import { cn } from '@/lib/utils';
import {
  type StatusBadgeSize,
  type StatusBadgeVariant,
  sizeClasses,
  variantClasses,
} from './StatusBadgeStyles';

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
  className = '',
  dynamic = false,
}: StatusBadgeProps) {
  return (
    <div
      role={dynamic ? 'status' : undefined}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border font-medium',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {icon && <span className='flex-shrink-0'>{icon}</span>}
      <span>{children}</span>
    </div>
  );
}
