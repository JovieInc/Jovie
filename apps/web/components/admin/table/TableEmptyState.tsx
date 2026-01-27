import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TableEmptyStateProps {
  /** Icon component from lucide-react */
  icon: LucideIcon;
  /** Main heading text */
  heading: string;
  /** Optional description text */
  description?: string;
  /** Additional className for the container */
  className?: string;
}

/**
 * Unified empty state component for admin tables.
 * Provides consistent styling across all table empty states.
 */
export function TableEmptyState({
  icon: Icon,
  heading,
  description,
  className,
}: TableEmptyStateProps) {
  return (
    <div
      role='status'
      className={cn(
        'px-4 py-10 text-center text-sm text-secondary-token flex flex-col items-center gap-3',
        className
      )}
    >
      <Icon className='h-6 w-6' aria-hidden='true' />
      <div>
        <div className='font-medium'>{heading}</div>
        {description && (
          <div className='text-xs text-tertiary-token mt-1'>{description}</div>
        )}
      </div>
    </div>
  );
}
