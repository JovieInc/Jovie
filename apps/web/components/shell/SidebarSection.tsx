'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const EASE_CINEMATIC = 'cubic-bezier(0.32, 0.72, 0, 1)';
const DURATION_CINEMATIC = 420;

const TIGHT_ITEM_HEIGHT = 26;
const DEFAULT_ITEM_HEIGHT = 30;
const SECTION_PADDING = 12;

/**
 * SidebarSection — collapsible header + body for a sidebar group.
 *
 * Header is a single row: rotating chevron + section name. Click toggles
 * `open`. Body collapses to height 0 with a cinematic ease so the parent
 * layout doesn't reflow visibly mid-transition.
 *
 * `collapsed` flips the section into icon mode: when open, only the body
 * children render (no chevron header). When collapsed AND closed, nothing
 * renders — the whole section is hidden.
 *
 * `itemCount` and `tight` drive the body's `max-height` so the transition
 * has something concrete to animate against. Caller is responsible for
 * counting how many rows it's rendering as children.
 *
 * @example
 * ```tsx
 * <SidebarSection
 *   name='Releases'
 *   open={open}
 *   onToggle={() => setOpen(o => !o)}
 *   itemCount={releases.length}
 * >
 *   {releases.map(r => <SidebarNavItem key={r.id} item={r} collapsed={false} nested />)}
 * </SidebarSection>
 * ```
 */
export function SidebarSection({
  name,
  open,
  onToggle,
  itemCount,
  collapsed = false,
  tight = false,
  className,
  children,
}: {
  readonly name: string;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly itemCount: number;
  readonly collapsed?: boolean;
  readonly tight?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  if (collapsed) {
    if (!open) return null;
    return <div className={cn('space-y-px', className)}>{children}</div>;
  }

  const itemHeight = tight ? TIGHT_ITEM_HEIGHT : DEFAULT_ITEM_HEIGHT;
  const bodyMaxHeight = open ? itemCount * itemHeight + SECTION_PADDING : 0;

  return (
    <div className={className}>
      <button
        type='button'
        onClick={onToggle}
        className={cn(
          'relative w-full flex items-center gap-2.5 pl-3 pr-2 rounded-md hover:bg-surface-1/70 transition-colors duration-150 ease-out',
          tight ? 'h-6' : 'h-7'
        )}
        aria-expanded={open}
      >
        <ChevronDown
          aria-hidden='true'
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-tertiary-token transition-transform duration-150 ease-out',
            !open && '-rotate-90'
          )}
          strokeWidth={2.25}
        />
        <span className='text-[13px] font-caption truncate text-primary-token tracking-[-0.015em]'>
          {name}
        </span>
      </button>
      <div
        className='overflow-hidden'
        style={{
          maxHeight: bodyMaxHeight,
          opacity: open ? 1 : 0,
          transition: `max-height ${DURATION_CINEMATIC}ms ${EASE_CINEMATIC}, opacity 200ms ease-out`,
        }}
      >
        <div className='relative space-y-px pt-1 pb-0.5 [&_a:hover]:bg-surface-1/50'>
          {children}
        </div>
      </div>
    </div>
  );
}
