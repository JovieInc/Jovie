'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-3.5 rounded-full bg-btn-primary text-btn-primary-foreground text-xs font-medium hover:bg-btn-primary-hover transition-colors duration-subtle ease-subtle',
        className
      )}
    >
      {Icon ? <Icon className='h-3.5 w-3.5' strokeWidth={2.5} /> : null}
      {label}
    </button>
  );
}
