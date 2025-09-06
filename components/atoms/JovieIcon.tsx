import { cn } from '@/lib/utils';

export const JOVIE_ICON_DEFAULT_SIZE = 24;

interface JovieIconProps {
  className?: string;
  size?: number;
  ariaLabel?: string;
  title?: string;
}

export function JovieIcon({
  className,
  size = JOVIE_ICON_DEFAULT_SIZE,
  ariaLabel,
  title,
}: JovieIconProps) {
  const labelled = ariaLabel ?? title;

  return (
    <svg
      width={size}
      height={size}
      viewBox='0 0 32 32'
      xmlns='http://www.w3.org/2000/svg'
      className={cn('text-black dark:text-white transition-colors', className)}
      fill='currentColor'
      role={labelled ? 'img' : undefined}
      aria-label={ariaLabel}
      title={title}
      aria-hidden={labelled ? undefined : 'true'}
    >
      {/* Music note icon */}
      <circle cx='8' cy='24' r='4' />
      <circle cx='20' cy='20' r='4' />
      <rect x='10' y='12' width='2' height='16' />
      <rect x='22' y='8' width='2' height='16' />
      <path d='M10 12h12v4H10z' />
    </svg>
  );
}
