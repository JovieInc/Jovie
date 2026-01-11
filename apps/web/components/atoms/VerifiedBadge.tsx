import { BadgeCheck } from 'lucide-react';

interface VerifiedBadgeProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function VerifiedBadge({
  size = 'md',
  className = '',
}: VerifiedBadgeProps) {
  const sizeClasses: Record<typeof size, string> = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
    lg: 'h-5 w-5',
  } as const;

  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label is needed for accessibility on span with icon
    <span
      className={`inline-flex align-middle rounded-full bg-white dark:bg-base p-0.5 text-sky-600 dark:text-sky-400 ${className}`}
      title='Verified Jovie Profile'
      aria-label='Verified Jovie Profile'
    >
      <BadgeCheck
        className={`${sizeClasses[size]} translate-y-[1px]`}
        aria-hidden='true'
        fill='currentColor'
        strokeWidth={1.5}
      />
    </span>
  );
}
