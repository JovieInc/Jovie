import { Button } from '@jovie/ui';
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
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-mid',
};

const TONE: Record<`${Tone}-${Context}`, string> = {
  'primary-on-dark':
    'bg-primary-token text-surface-1 hover:bg-primary-token/90',
  'primary-auto': 'bg-primary-token text-surface-1 hover:bg-primary-token/90',
  'secondary-on-dark':
    'bg-surface-1 text-primary-token border border-subtle hover:bg-surface-0',
  'secondary-auto':
    'bg-transparent text-primary-token border border-subtle hover:bg-surface-2/80',
};

const RING_OFFSET: Record<Context, string> = {
  'on-dark': 'focus-visible:ring-offset-base',
  auto: 'focus-visible:ring-offset-surface-1',
};

/** Class string for non-Button CTA surfaces (e.g. claim form submit). */
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
    'inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-tight',
    'transition-[background-color,border-color,opacity] duration-subtle ease-subtle',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2',
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
  className,
  'data-testid': testId,
  'aria-label': ariaLabel,
}: Readonly<ShellCtaButtonProps>) {
  return (
    <Button
      variant={tone === 'primary' ? 'primary' : 'secondary'}
      size={size}
      asChild
      className={className}
    >
      <Link href={href} data-testid={testId} aria-label={ariaLabel}>
        {children}
      </Link>
    </Button>
  );
}
