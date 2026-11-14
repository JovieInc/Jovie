import { cn } from '@/lib/utils';

interface BackgroundPatternProps {
  readonly variant?: 'grid' | 'dots' | 'gradient';
  readonly className?: string;
}

export const BACKGROUND_PATTERNS = {
  grid: 'bg-(image:--background-pattern-grid) dark:bg-(image:--background-pattern-grid-dark) bg-[size:50px_50px]',
  dots: 'bg-(image:--background-pattern-dots) dark:bg-(image:--background-pattern-dots-dark) bg-[size:20px_20px]',
  gradient:
    'bg-gradient-to-br from-surface-0 via-surface-1 to-surface-0 dark:from-base dark:via-surface-1 dark:to-base',
} as const;

export function BackgroundPattern({
  variant = 'grid',
  className,
}: BackgroundPatternProps) {
  return (
    <div
      className={cn(
        'absolute inset-0',
        BACKGROUND_PATTERNS[variant],
        className
      )}
      aria-hidden='true'
    />
  );
}
