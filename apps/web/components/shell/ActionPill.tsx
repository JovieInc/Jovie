'use client';

import { Button } from '@jovie/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * ActionPill — primary semantic CTA pill used in shell headers.
 *
 * The canonical primary surface/foreground tokens keep the pill aligned with
 * the shared Button family across themes without hard-coded color pairs.
 *
 * Pure presentational. Caller controls label, icon, and click handler.
 *
 * @example
 * ```tsx
 * import { Plus } from 'lucide-react';
 *
 * <ActionPill label='New release' icon={Plus} onClick={openComposer} />
 * ```
 */
export function ActionPill({
  label,
  icon: Icon,
  onClick,
  type = 'button',
  className,
}: {
  readonly label: ReactNode;
  readonly icon?: LucideIcon;
  readonly onClick?: () => void;
  readonly type?: 'button' | 'submit';
  readonly className?: string;
}) {
  return (
    <Button
      variant='primary'
      size='sm'
      type={type}
      onClick={onClick}
      className={className}
    >
      {Icon ? <Icon className='h-3.5 w-3.5' strokeWidth={2.5} /> : null}
      {label}
    </Button>
  );
}
