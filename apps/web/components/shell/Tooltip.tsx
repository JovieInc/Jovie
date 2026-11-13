'use client';

import {
  Kbd,
  TooltipContent,
  TooltipProvider,
  Tooltip as TooltipRoot,
  TooltipTrigger,
} from '@jovie/ui';
import { OVERLAY_SIDE_OFFSET } from '@jovie/ui/lib/dropdown-styles';
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
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { ShortcutHint } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

export interface TooltipProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly shortcut?: ShortcutHint;
  readonly side?: 'top' | 'bottom' | 'right' | 'left';
  readonly align?: 'start' | 'center' | 'end';
  readonly disabled?: boolean;
  readonly className?: string;
  // `block` for full-width triggers (sidebar nav rows). Default is
  // inline-flex which sizes to children — right for icon buttons.
  readonly block?: boolean;
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
}

const DEFAULT_SIDE_OFFSET = OVERLAY_SIDE_OFFSET;

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
}: Pick<TooltipProps, 'children' | 'className' | 'block'>) {
  if (Children.count(children) === 1) {
    const onlyChild = Children.only(children);
    if (isElementWithClassName(onlyChild)) {
      return cloneElement(onlyChild, {
        className: cn(onlyChild.props.className, className),
      });
    }
  }

  // Non-element / multi-child fallback: layout wrapper only. The seam offset
  // is measured from the trigger's own pointer and focus events.
  return (
    <span className={cn(block ? 'flex w-full' : 'inline-flex', className)}>
      {children}
    </span>
  );
}

export function Tooltip({
  children,
  label,
  shortcut,
  side = 'bottom',
  align = 'center',
  disabled = false,
  className,
  block,
  open,
  defaultOpen,
}: TooltipProps) {
  const [hintOpen, setHintOpen] = useState(defaultOpen ?? false);
  const [touchActive, setTouchActive] = useState(false);
  const touchInput = useRef(false);
  // Keep the Radix root controlled even while eligibility changes. A fitting
  // title closes its hint permanently until fresh pointer/keyboard intent.
  useLayoutEffect(() => {
    if (disabled || touchActive) setHintOpen(false);
  }, [disabled, touchActive]);
  // A forced-closed tooltip (`open={false}`) holds no latent intent: when the
  // owner releases it (sidebar collapse flips the label), it needs a fresh
  // hover or focus instead of popping open with no pointer on it.
  useLayoutEffect(() => {
    if (open === false) setHintOpen(false);
  }, [open]);
  const onPointerInput = useCallback((event: PointerEvent<HTMLElement>) => {
    touchInput.current = event.pointerType === 'touch';
    setTouchActive(touchInput.current);
  }, []);
  const onKeyboardInput = useCallback(() => {
    touchInput.current = false;
    setTouchActive(false);
  }, []);
  useEffect(() => {
    if (!touchActive) return;
    // Tab may originate outside this trigger on a hybrid device.
    document.addEventListener('keydown', onKeyboardInput, true);
    return () => document.removeEventListener('keydown', onKeyboardInput, true);
  }, [touchActive, onKeyboardInput]);
  const [seamOffset, setSeamOffset] = useState<number | null>(null);

  // Measured on pointer or focus intent on the trigger, just before Radix
  // opens. Measuring from a ref callback ran getBoundingClientRect (a forced
  // layout) and a state update in the commit of every right-side tooltip, on
  // every render, inside the cold-load hydration task.
  const measureSeam = useCallback(
    (target: HTMLElement) => {
      if (side === 'right') setSeamOffset(getSeamSideOffset(target));
    },
    [side]
  );

  const triggerChild = getTriggerChild({
    children,
    className,
    block,
  });

  const sideOffset =
    side === 'right' && seamOffset !== null ? seamOffset : DEFAULT_SIDE_OFFSET;

  return (
    <TooltipProvider>
      <TooltipRoot
        open={!disabled && !touchActive && (open ?? hintOpen)}
        onOpenChange={value =>
          setHintOpen(
            open !== false && !disabled && !touchInput.current && value
          )
        }
      >
        <TooltipTrigger
          asChild
          onPointerEnter={event => {
            onPointerInput(event);
            measureSeam(event.currentTarget);
          }}
          onPointerDown={onPointerInput}
          onFocus={event => measureSeam(event.currentTarget)}
          onKeyDown={onKeyboardInput}
        >
          {triggerChild}
        </TooltipTrigger>
        <TooltipContent
          data-slot='shell-tooltip-content'
          contentVariant='rich'
          style={{ zIndex: 'calc(var(--jovie-shell-overlay-z-index) + 1)' }}
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          <span className='min-w-0 break-words'>{label}</span>
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
