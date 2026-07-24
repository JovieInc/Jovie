'use client';

import {
  Kbd,
  TooltipContent,
  TooltipProvider,
  Tooltip as TooltipRoot,
  TooltipTrigger,
} from '@jovie/ui';
import {
  Children,
  cloneElement,
  type FocusEvent,
  Fragment,
  isValidElement,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useCallback,
  useState,
} from 'react';
import type { ShortcutHint } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly shortcut?: ShortcutHint;
  readonly side?: 'top' | 'bottom' | 'right' | 'left';
  readonly className?: string;
  // `block` for full-width triggers (sidebar nav rows). Default is
  // inline-flex which sizes to children — right for icon buttons.
  readonly block?: boolean;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
}

const DEFAULT_SIDE_OFFSET = 6;

// Gap between the seam boundary's right edge and the tooltip's left edge, so
// every seam-aligned tooltip shares one consistent x just past the divider.
export const SEAM_GAP = 8;

// Ancestors whose right edge is a visual seam (e.g. the sidebar's vertical
// divider). `[data-sidebar="sidebar"]` covers the app sidebar out of the box;
// `[data-tooltip-boundary]` is the generic opt-in for other containers.
export const SEAM_BOUNDARY_SELECTOR =
  '[data-tooltip-boundary], [data-sidebar="sidebar"]';

/**
 * For `side='right'` tooltips inside a seam container (sidebar), compute the
 * Radix `sideOffset` that places the tooltip's left edge at a consistent x —
 * `SEAM_GAP` past the container's right edge (the vertical divider) — instead
 * of 6px past each trigger row's own right edge.
 *
 * Returns `null` when the trigger has no seam ancestor (default offset applies).
 */
export function getSeamSideOffset(
  trigger: HTMLElement,
  gap: number = SEAM_GAP
): number | null {
  const boundary = trigger.closest(SEAM_BOUNDARY_SELECTOR);
  if (!boundary) return null;
  const delta =
    boundary.getBoundingClientRect().right -
    trigger.getBoundingClientRect().right;
  // Never let the tooltip overlap back into the container.
  return Math.max(Math.round(delta) + gap, gap);
}

interface TriggerHandlerProps {
  readonly className?: string;
  readonly onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  readonly onFocus?: (event: FocusEvent<HTMLElement>) => void;
  readonly ref?: Ref<HTMLElement | null>;
}

function isElementWithClassName(
  child: ReactNode
): child is ReactElement<TriggerHandlerProps> {
  return isValidElement<TriggerHandlerProps>(child) && child.type !== Fragment;
}

function getTriggerChild({
  children,
  className,
  block,
  onTriggerIntent,
  triggerRef,
}: Pick<TooltipProps, 'children' | 'className' | 'block'> & {
  readonly onTriggerIntent?: (target: HTMLElement) => void;
  readonly triggerRef?: (node: HTMLElement | null) => void;
}) {
  if (Children.count(children) === 1) {
    const onlyChild = Children.only(children);
    if (isElementWithClassName(onlyChild)) {
      return cloneElement(onlyChild, {
        // Width constraints only — do not force flex/grid; the child owns layout
        // (sidebar thread rows are CSS grid; flex would break title shrink).
        className: cn(
          onlyChild.props.className,
          block && 'w-full min-w-0',
          className
        ),
        ref: (node: HTMLElement | null) => {
          triggerRef?.(node);
          const existingRef = onlyChild.props.ref;
          if (typeof existingRef === 'function') {
            existingRef(node);
          } else if (existingRef && typeof existingRef === 'object') {
            (existingRef as { current: HTMLElement | null }).current = node;
          }
        },
        // Measure on the interactive child (button/link) — not a static wrapper.
        onPointerEnter: (event: PointerEvent<HTMLElement>) => {
          onlyChild.props.onPointerEnter?.(event);
          onTriggerIntent?.(event.currentTarget);
        },
        onFocus: (event: FocusEvent<HTMLElement>) => {
          onlyChild.props.onFocus?.(event);
          onTriggerIntent?.(event.currentTarget);
        },
      });
    }
  }

  // Non-element / multi-child fallback: layout wrapper only. Seam offset is
  // measured via ref callback (no pointer/focus handlers on a static span).
  // Handlers on a static <span> would trip a11y noStaticElementInteractions.
  return (
    <span
      ref={triggerRef}
      className={cn(block ? 'flex w-full min-w-0' : 'inline-flex', className)}
    >
      {children}
    </span>
  );
}

export function Tooltip({
  children,
  label,
  shortcut,
  side = 'bottom',
  className,
  block,
  open,
  defaultOpen,
}: TooltipProps) {
  const [seamOffset, setSeamOffset] = useState<number | null>(null);

  // Measured on hover/focus of the interactive trigger (just before Radix
  // opens) so the offset tracks the live layout without observers.
  const handleTriggerIntent = useCallback(
    (target: HTMLElement) => {
      if (side !== 'right') return;
      setSeamOffset(getSeamSideOffset(target));
    },
    [side]
  );

  // Fallback path (non-single-element children): measure when the wrapper
  // mounts/updates. Prefer the single-child path above for interactive rows.
  const triggerRef = useCallback(
    (node: HTMLElement | null) => {
      if (!node || side !== 'right') return;
      setSeamOffset(getSeamSideOffset(node));
    },
    [side]
  );

  const triggerChild = getTriggerChild({
    children,
    className,
    block,
    onTriggerIntent: side === 'right' ? handleTriggerIntent : undefined,
    triggerRef: side === 'right' ? triggerRef : undefined,
  });

  const sideOffset =
    side === 'right' && seamOffset !== null ? seamOffset : DEFAULT_SIDE_OFFSET;

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={40}>
      <TooltipRoot open={open} defaultOpen={defaultOpen}>
        <TooltipTrigger asChild>{triggerChild}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={sideOffset}
          style={{ zIndex: 'var(--jovie-shell-overlay-z-index)' }}
          className='flex items-center gap-2'
        >
          {/* Long labels (thread titles) wrap to at most two lines, then
              ellipsize — never hard-clip mid-glyph. */}
          <span className='line-clamp-2 min-w-0 break-words'>{label}</span>
          {shortcut ? (
            <Kbd variant='tooltip' className='shrink-0'>
              {shortcut.keys}
            </Kbd>
          ) : null}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
