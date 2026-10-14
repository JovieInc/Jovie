import Link from 'next/link';
import { APP_NAME } from '@/constants/app';
import { Wordmark } from '@/lib/brand/primitives';
import { cn } from '@/lib/utils';

interface JovieLogoProps {
  readonly href?: string;
  readonly artistHandle?: string;
  readonly className?: string;
  readonly variant?: 'light' | 'dark';
  readonly showText?: boolean;
  readonly ariaLabel?: string;
  readonly target?: React.AnchorHTMLAttributes<HTMLAnchorElement>['target'];
  readonly title?: string;
  readonly size?: 'sm' | 'md';
}

export function JovieLogo({
  href = '/',
  artistHandle,
  className = '',
  variant = 'light',
  showText = false,
  ariaLabel,
  target,
  title,
  size = 'md',
}: JovieLogoProps) {
  const finalHref = artistHandle
    ? `${href}?utm_source=profile&utm_artist=${artistHandle}`
    : href;

  const colorClass =
    variant === 'light'
      ? 'text-tertiary-token hover:text-primary-token'
      : 'text-white dark:text-white hover:text-white/80';

  const wrapperClasses = cn('flex items-center gap-2', className);
  const sizeClass = size === 'sm' ? 'h-4' : 'h-6';

  const logoContent = (
    <>
      <Wordmark
        height={size === 'sm' ? 16 : 24}
        color='currentColor'
        title={`${APP_NAME} logo`}
        className={cn('w-auto transition-colors', colorClass, sizeClass)}
      />
      {showText && (
        <span className={cn('font-medium', colorClass)}>{APP_NAME}</span>
      )}
    </>
  );

  const computedAriaLabel =
    ariaLabel ??
    (artistHandle
      ? `Create your own profile with ${APP_NAME}`
      : `${APP_NAME} home`);

  if (href) {
    return (
      <Link
        href={finalHref}
        aria-label={computedAriaLabel}
        target={target}
        rel={target === '_blank' ? 'noopener noreferrer' : undefined}
        className='rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 transition-colors'
        title={title}
      >
        <div className={wrapperClasses}>{logoContent}</div>
      </Link>
    );
  }

  return (
    <div className={wrapperClasses} title={title}>
      {logoContent}
    </div>
  );
}
