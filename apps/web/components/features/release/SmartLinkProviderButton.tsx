import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SmartLinkProviderButtonProps {
  readonly label: string;
  readonly iconPath?: string;
  /** Brand color for the provider icon. Falls back to muted foreground. */
  readonly iconColor?: string;
  /** Custom icon element — used instead of iconPath when provided */
  readonly icon?: ReactNode;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly ariaLabel?: string;
  /** The canonical full-width primary provider action used by the payment terminal. */
  readonly primary?: boolean;
}

/**
 * Canonical DSP provider button used across smart link, listen mode, and marketing demos.
 */
export function SmartLinkProviderButton({
  label,
  iconPath,
  iconColor,
  icon,
  href,
  onClick,
  className,
  disabled = false,
  ariaLabel,
  primary = false,
}: Readonly<SmartLinkProviderButtonProps>) {
  const content = (
    <>
      {icon ??
        (iconPath ? (
          <svg
            viewBox='0 0 24 24'
            fill='currentColor'
            className={cn(
              'h-5 w-5 shrink-0',
              iconColor ? undefined : 'text-muted-foreground'
            )}
            style={iconColor ? { color: iconColor } : undefined}
            aria-hidden='true'
          >
            <path d={iconPath} />
          </svg>
        ) : null)}
      <span
        className={cn(
          primary
            ? 'text-btn-primary-foreground flex-none'
            : 'text-foreground flex-1',
          'text-base font-semibold'
        )}
      >
        {label}
      </span>
      {primary ? null : (
        <svg
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          className='h-4 w-4 text-muted-foreground/70'
          aria-hidden='true'
        >
          <path
            d='m9 18 6-6-6-6'
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        </svg>
      )}
    </>
  );

  const sharedClassName = cn(
    primary
      ? 'group flex min-h-13 w-full items-center justify-center gap-2 rounded-full border border-btn-primary bg-btn-primary px-5 text-btn-primary-foreground shadow-button-inset transition-[background-color,border-color,color,box-shadow,opacity] duration-subtle hover:border-btn-primary-hover hover:bg-btn-primary-hover disabled:pointer-events-none disabled:opacity-[var(--state-disabled-opacity)]'
      : 'group flex w-full items-center gap-3.5 rounded-full bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/[0.08] backdrop-blur-sm transition-colors duration-fast hover:bg-white/15',
    className
  );

  if (!href) {
    if (onClick) {
      return (
        <button
          type='button'
          onClick={onClick}
          className={sharedClassName}
          aria-label={ariaLabel ?? `Open ${label}`}
          disabled={disabled}
        >
          {content}
        </button>
      );
    }

    return <div className={sharedClassName}>{content}</div>;
  }

  return (
    <a
      href={href}
      target='_blank'
      rel='noopener noreferrer'
      onClick={onClick}
      className={sharedClassName}
      aria-label={ariaLabel ?? `Open ${label}`}
    >
      {content}
    </a>
  );
}
