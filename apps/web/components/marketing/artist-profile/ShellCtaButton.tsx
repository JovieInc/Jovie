import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'primary' | 'secondary';
type Size = 'md' | 'lg';
type Context = 'on-dark' | 'auto';

interface ShellCtaButtonProps {
  readonly href: string;
  readonly children: ReactNode;
  readonly tone?: Tone;
  readonly size?: Size;
  readonly context?: Context;
  readonly className?: string;
  readonly 'data-testid'?: string;
  readonly 'aria-label'?: string;
}

const SHAPE: Record<Size, string> = {
  md: 'h-11 px-5 text-[14px]',
  lg: 'h-12 px-6 text-[15px]',
};

const TONE: Record<`${Tone}-${Context}`, string> = {
  'primary-on-dark':
    'bg-white text-black hover:bg-white/90 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]',
  'primary-auto':
    'bg-[var(--color-text-primary-token)] text-[var(--color-bg-surface-1)] hover:bg-[var(--color-text-primary-token)]/90',
  'secondary-on-dark':
    'bg-white/[0.04] text-white border border-white/12 hover:bg-white/[0.08]',
  'secondary-auto':
    'bg-transparent text-primary-token border border-[var(--linear-app-shell-border)] hover:bg-[var(--color-bg-surface-2)]/80',
};

const RING_OFFSET: Record<Context, string> = {
  'on-dark': 'focus-visible:ring-offset-black',
  auto: 'focus-visible:ring-offset-[var(--color-bg-surface-1)]',
};

export function shellCtaClassName({
  tone = 'primary',
  size = 'md',
  context = 'auto',
}: {
  tone?: Tone;
  size?: Size;
  context?: Context;
} = {}) {
  return cn(
    'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-[-0.011em]',
    'transition-[background-color,border-color,box-shadow,transform] duration-150 ease-[cubic-bezier(0.25,0.46,0.45,0.94)]',
    'active:scale-[0.985] motion-reduce:transition-none motion-reduce:active:scale-100',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--linear-border-focus)] focus-visible:ring-offset-2',
    RING_OFFSET[context],
    SHAPE[size],
    TONE[`${tone}-${context}`]
  );
}

export function ShellCtaButton({
  href,
  children,
  tone = 'primary',
  size = 'md',
  context = 'auto',
  className,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: Readonly<ShellCtaButtonProps>) {
  return (
    <Link
      href={href}
      data-testid={testId}
      aria-label={ariaLabel}
      className={cn(shellCtaClassName({ tone, size, context }), className)}
    >
      {children}
    </Link>
  );
}
