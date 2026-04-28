'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ActionPill — primary white-on-dark CTA pill used in shell headers.
 *
 * White surface with black text, leading optional icon, single-row pill.
 * White was chosen over a saturated brand color because primary actions
 * shouldn't compete with the brand mark or status chips — white-on-dark
 * stays the visual anchor without screaming.
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
        'inline-flex items-center gap-1.5 h-7 px-3.5 rounded-full bg-white text-black text-[12px] font-medium hover:bg-white/90 transition-colors duration-150 ease-out',
        className
      )}
    >
      {Icon ? <Icon className='h-3.5 w-3.5' strokeWidth={2.5} /> : null}
      {label}
    </button>
  );
}
