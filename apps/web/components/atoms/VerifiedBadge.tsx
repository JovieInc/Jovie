import { CheckBadgeIcon } from '@heroicons/react/24/solid';

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
    <span
      className={`inline-flex align-middle text-sky-600 dark:text-sky-400 ${className}`}
      title='Verified artist'
      aria-label='Verified artist'
    >
      <CheckBadgeIcon
        className={`${sizeClasses[size]} translate-y-[1px]`}
        aria-hidden='true'
      />
    </span>
  );
}
