'use client';

import { Button } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ProfileEmptyBentoAccent = 'music' | 'events';

export type ProfileEmptyBentoLayout = 'prominent' | 'compact' | 'inline';

/**
 * Full-color accent gradients for profile empty/low-content bento cards.
 * Inline styles (not arbitrary Tailwind) to avoid the arbitrary-value ratchet.
 */
const ACCENT_GRADIENTS: Record<ProfileEmptyBentoAccent, CSSProperties> = {
  music: {
    background:
      'radial-gradient(120% 100% at 50% -8%, color-mix(in oklab, var(--color-accent-pink) 78%, white) 0%, color-mix(in oklab, var(--color-accent-pink) 44%, #2a1028) 44%, color-mix(in oklab, var(--color-accent-pink) 20%, #0a0814) 100%)',
  },
  // Events: standard surface-1 card treatment (no off-token accent gradient).
  events: {
    background:
      'linear-gradient(155deg, var(--color-bg-surface-2), var(--color-bg-surface-1))',
  },
};

export interface ProfileEmptyBentoCardProps {
  readonly accent: ProfileEmptyBentoAccent;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly layout?: ProfileEmptyBentoLayout;
  readonly trailing?: ReactNode;
  readonly action?: ReactNode;
  readonly href?: string;
  readonly onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  readonly ariaLabel?: string;
  readonly className?: string;
  readonly dataTestId?: string;
}

function CardShell({
  href,
  onClick,
  ariaLabel,
  className,
  style,
  dataTestId,
  children,
}: Readonly<{
  href?: string;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  ariaLabel?: string;
  className: string;
  style: CSSProperties;
  dataTestId?: string;
  children: ReactNode;
}>) {
  if (href) {
    return (
      <a
        href={href}
        onClick={onClick}
        aria-label={ariaLabel}
        className={className}
        style={style}
        data-testid={dataTestId}
      >
        {children}
      </a>
    );
  }

  if (onClick) {
    return (
      <Button
        type='button'
        variant='ghost'
        onClick={onClick}
        aria-label={ariaLabel}
        className={cn('h-auto rounded-(--profile-inner-radius) p-0', className)}
        style={style}
        data-testid={dataTestId}
      >
        {children}
      </Button>
    );
  }

  return (
    <div className={className} style={style} data-testid={dataTestId}>
      {children}
    </div>
  );
}

export function ProfileEmptyBentoCard({
  accent,
  icon: Icon,
  title,
  body,
  layout = 'compact',
  trailing,
  action,
  href,
  onClick,
  ariaLabel,
  className,
  dataTestId,
}: ProfileEmptyBentoCardProps) {
  const gradientStyle = ACCENT_GRADIENTS[accent];
  const isInline = layout === 'inline';
  const isProminent = layout === 'prominent';

  const shellClassName = cn(
    'group relative w-full min-w-0 overflow-hidden rounded-(--profile-inner-radius) border border-white/14 text-left text-white shadow-[0_18px_46px_rgba(0,0,0,0.34)] transition-[transform,opacity] duration-subtle dark:text-white',
    (href || onClick) &&
      'cursor-pointer hover:brightness-[1.04] active:opacity-90',
    isInline && 'flex min-h-16 items-center gap-3 px-3.5 py-3',
    isProminent && 'flex min-h-44 flex-col justify-between p-4',
    layout === 'compact' && 'flex min-h-36 flex-col justify-between p-4',
    className
  );

  const iconClassName = cn(
    'shrink-0 text-white/92',
    isInline ? 'h-5 w-5' : isProminent ? 'h-6 w-6' : 'h-5 w-5'
  );

  const titleClassName = cn(
    'font-semibold leading-tight text-white [overflow-wrap:anywhere] dark:text-white',
    isInline
      ? 'text-app'
      : isProminent
        ? 'text-lg tracking-[-0.018em]'
        : 'text-base tracking-[-0.016em]'
  );

  const bodyClassName = cn(
    'text-white/72 [overflow-wrap:anywhere]',
    isInline
      ? 'mt-0.5 block max-w-64 text-2xs leading-4 text-white/68'
      : isProminent
        ? 'mt-1.5 max-w-[30ch] text-sm leading-5'
        : 'mt-1 max-w-[32ch] text-xs leading-5'
  );

  const content = isInline ? (
    <>
      <Icon className={iconClassName} aria-hidden='true' />
      <span className='min-w-0 flex-1'>
        <span className={cn(titleClassName, 'block')}>{title}</span>
        <span className={bodyClassName}>{body}</span>
      </span>
      {trailing}
    </>
  ) : (
    <>
      <div className='relative z-10 flex items-start gap-3'>
        <span className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/18 bg-white/12 backdrop-blur-md'>
          <Icon className={iconClassName} aria-hidden='true' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className={titleClassName}>{title}</p>
          <p className={bodyClassName}>{body}</p>
        </div>
        {trailing ? <div className='shrink-0'>{trailing}</div> : null}
      </div>
      {action ? <div className='relative z-10 mt-4'>{action}</div> : null}
    </>
  );

  return (
    <CardShell
      href={href}
      onClick={onClick}
      ariaLabel={ariaLabel}
      className={shellClassName}
      style={gradientStyle}
      dataTestId={dataTestId}
    >
      <span
        aria-hidden='true'
        className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_88%,rgba(255,255,255,0.14),transparent_42%)]'
      />
      <span
        aria-hidden='true'
        className='pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(to_top,rgba(0,0,0,0.22),transparent)]'
      />
      <div className='relative z-10 flex h-full w-full flex-col'>{content}</div>
    </CardShell>
  );
}
