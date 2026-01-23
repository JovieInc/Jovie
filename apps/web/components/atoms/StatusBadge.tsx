import { cn } from '@/lib/utils';
import {
  type StatusBadgeSize,
  type StatusBadgeVariant,
  sizeClasses,
  variantClasses,
} from './StatusBadgeStyles';

export interface StatusBadgeProps {
  /** Badge text content */
  children: React.ReactNode;
  /** Color variant for the badge */
  variant?: StatusBadgeVariant;
  /** Optional icon to display before text */
  icon?: React.ReactNode;
  /** Size variant */
  size?: StatusBadgeSize;
  /** Additional CSS classes */
  className?: string;
  /** Whether the badge communicates dynamic state */
  dynamic?: boolean;
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
    // NOSONAR S6819: role="status" is correct for live announcements; <output> is for form calculation results
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
