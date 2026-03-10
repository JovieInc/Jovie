import { cn } from '@/lib/utils';

interface SmartLinkProviderButtonProps {
  readonly label: string;
  readonly iconPath?: string;
  readonly href?: string;
  readonly onClick?: () => void;
  readonly className?: string;
}

/**
 * Canonical DSP provider button used across smart link, listen mode, and marketing demos.
 */
export function SmartLinkProviderButton({
  label,
  iconPath,
  href,
  onClick,
  className,
}: Readonly<SmartLinkProviderButtonProps>) {
  const content = (
    <>
      {iconPath ? (
        <svg
          viewBox='0 0 24 24'
          fill='currentColor'
          className='h-5 w-5 shrink-0 text-muted-foreground'
          aria-hidden='true'
        >
          <path d={iconPath} />
        </svg>
      ) : null}
      <span className='text-foreground flex-1 text-base font-semibold'>
        {label}
      </span>
      <svg
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        className='h-4 w-4 text-muted-foreground/70'
        aria-hidden='true'
      >
        <path d='m9 18 6-6-6-6' strokeLinecap='round' strokeLinejoin='round' />
      </svg>
    </>
  );

  const sharedClassName = cn(
    'group flex w-full items-center gap-3.5 rounded-xl bg-surface-1/70 px-4 py-3 ring-1 ring-inset ring-white/[0.08] backdrop-blur-sm transition-colors duration-100 hover:bg-surface-2/80',
    className
  );

  if (!href) {
    if (onClick) {
      return (
        <button type='button' onClick={onClick} className={sharedClassName}>
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
    >
      {content}
    </a>
  );
}
