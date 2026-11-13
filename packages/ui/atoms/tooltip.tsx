'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import {
  DROPDOWN_TRANSITIONS,
  OVERLAY_COLLISION_PADDING,
  OVERLAY_CONTENT_RADIUS,
  OVERLAY_SIDE_OFFSET,
  TOOLTIP_SURFACE_BASE,
  TOOLTIP_SURFACE_DANGER,
} from '../lib/dropdown-styles';
import { cn } from '../lib/utils';

/**
 * TooltipProvider with sensible defaults for delays and pointer safety.
 * Should be rendered at app-level to provide tooltip context.
 */
const TooltipProviderScope = React.createContext(false);

const TooltipProvider = ({
  delayDuration,
  skipDelayDuration,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) => {
  const inherited = React.useContext(TooltipProviderScope);
  // Default wrappers share the app's warm-up window. Explicit timing or
  // hoverability remains available for isolated fixtures and forced notices.
  if (
    inherited &&
    delayDuration === undefined &&
    skipDelayDuration === undefined &&
    props.disableHoverableContent === undefined
  ) {
    return <>{props.children}</>;
  }
  return (
    <TooltipProviderScope.Provider value>
      <TooltipPrimitive.Provider
        delayDuration={delayDuration ?? 300}
        skipDelayDuration={skipDelayDuration ?? 300}
        {...props}
      />
    </TooltipProviderScope.Provider>
  );
};
TooltipProvider.displayName = TooltipPrimitive.Provider.displayName;

interface TooltipAnchorScopeValue {
  /** Lets the root observe the element its content is anchored to. */
  readonly setAnchor: (node: HTMLElement | null) => void;
  /** Pointer or focus left the trigger while no content was showing. */
  readonly endIntent: () => void;
}

const TooltipAnchorScope = React.createContext<TooltipAnchorScopeValue | null>(
  null
);

const HIDDEN_ANCESTOR = '[inert], [hidden]';

/**
 * False when the anchor cannot be seen or reached: unmounted, `display:none`,
 * `visibility:hidden`, or under an inert / hidden / aria-hidden ancestor.
 * Style reads only; geometry comes from the observers so no layout is forced.
 */
function isAnchorRendered(anchor: HTMLElement): boolean {
  if (!anchor.isConnected) return false;
  if (anchor.closest(HIDDEN_ANCESTOR)) return false;
  if (anchor.parentElement?.closest('[aria-hidden="true"]')) return false;
  if (typeof anchor.checkVisibility === 'function') {
    return anchor.checkVisibility({ visibilityProperty: true });
  }
  for (let node: HTMLElement | null = anchor; node; node = node.parentElement) {
    if (getComputedStyle(node).display === 'none') return false;
  }
  return getComputedStyle(anchor).visibility !== 'hidden';
}

/**
 * Anchor invariant: tooltip content never outlives its trigger. While a
 * tooltip is requested open this reports `true` as soon as the trigger
 * unmounts, is hidden, collapses to zero size, or leaves the viewport or its
 * clipping container (a collapsing sidebar), and `false` again if it returns.
 * Observers exist only while a tooltip is open, so idle triggers cost nothing.
 */
function useAnchorDetached(
  requested: boolean,
  anchor: HTMLElement | null,
  hadAnchor: boolean
): boolean {
  const [detached, setDetached] = React.useState(false);

  React.useEffect(() => {
    if (!requested) return;
    if (!anchor) {
      // An anchor that was mounted and is now gone is an unmounted trigger.
      setDetached(hadAnchor);
      return () => setDetached(false);
    }
    let outOfView = false;
    let zeroSize = false;
    const evaluate = () =>
      setDetached(outOfView || zeroSize || !isAnchorRendered(anchor));
    evaluate();

    const intersection =
      typeof IntersectionObserver === 'function'
        ? new IntersectionObserver(entries => {
            const entry = entries.at(-1);
            if (!entry) return;
            outOfView = !entry.isIntersecting;
            evaluate();
          })
        : null;
    intersection?.observe(anchor);

    const resize =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            // Layout is clean inside the callback, so this read is free. The
            // rect (not the entry) keeps inline triggers measurable.
            const rect = anchor.getBoundingClientRect();
            zeroSize = rect.width === 0 && rect.height === 0;
            evaluate();
          })
        : null;
    resize?.observe(anchor);

    const mutation =
      typeof MutationObserver === 'function'
        ? new MutationObserver(evaluate)
        : null;
    mutation?.observe(anchor.ownerDocument.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'inert', 'aria-hidden'],
    });

    return () => {
      intersection?.disconnect();
      resize?.disconnect();
      mutation?.disconnect();
      setDetached(false);
    };
  }, [requested, anchor, hadAnchor]);

  return detached;
}

/**
 * Tooltip root component with SSR-safe defaults. Owns the anchor invariant:
 * content closes when its trigger unmounts, hides, or leaves view.
 */
const Tooltip = ({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false
  );
  const requested = open ?? uncontrolledOpen;
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  const hadAnchor = React.useRef(false);
  if (anchor) hadAnchor.current = true;
  const detached = useAnchorDetached(requested, anchor, hadAnchor.current);

  const shown = requested && !detached;
  const shownRef = React.useRef(shown);
  shownRef.current = shown;
  const onOpenChangeRef = React.useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  const reportedOpen = React.useRef(requested);
  const handleOpenChange = React.useCallback((next: boolean) => {
    reportedOpen.current = next;
    setUncontrolledOpen(next);
    onOpenChangeRef.current?.(next);
  }, []);
  // Report the forced close once so controlled owners drop stale open state.
  React.useEffect(() => {
    if (detached) handleOpenChange(false);
  }, [detached, handleOpenChange]);

  const scope = React.useMemo<TooltipAnchorScopeValue>(
    () => ({
      setAnchor,
      // Radix only reports a close for content it is showing. An owner that
      // was told "open" while forcing the tooltip closed would otherwise keep
      // that intent forever and pop the tooltip later with no pointer on it.
      endIntent: () => {
        if (!shownRef.current && reportedOpen.current) handleOpenChange(false);
      },
    }),
    [handleOpenChange]
  );

  return (
    <TooltipAnchorScope.Provider value={scope}>
      <TooltipPrimitive.Root
        open={shown}
        onOpenChange={handleOpenChange}
        {...props}
      />
    </TooltipAnchorScope.Provider>
  );
};
Tooltip.displayName = TooltipPrimitive.Root.displayName;

/**
 * Tooltip trigger that properly forwards refs and manages accessibility.
 */
const TooltipTrigger = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>(({ asChild = true, onPointerLeave, onBlur, ...props }, ref) => {
  const scope = React.useContext(TooltipAnchorScope);
  const setAnchor = scope?.setAnchor;
  const composedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      setAnchor?.(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref, setAnchor]
  );
  return (
    <TooltipPrimitive.Trigger
      ref={composedRef}
      asChild={asChild}
      {...props}
      onPointerLeave={event => {
        onPointerLeave?.(event);
        scope?.endIntent();
      }}
      onBlur={event => {
        onBlur?.(event);
        scope?.endIntent();
      }}
    />
  );
});
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  /**
   * `compact` is reserved for an author-confirmed, single-line label. It fits
   * on one line when space allows and wraps at narrow viewport edges. Both
   * variants use the shared rounded-rectangle
   * surface; `rich` is the default for content that may wrap or contain
   * structured children.
   */
  readonly contentVariant?: 'compact' | 'rich';
  /**
   * Whether to show the arrow pointer. Defaults to false for cleaner Linear-style appearance.
   */
  readonly showArrow?: boolean;
  /**
   * Test ID for the tooltip content.
   * @default "tooltip-content"
   */
  readonly testId?: string;
  /**
   * `danger` swaps the tokenized tooltip surface for the shared error
   * tokens (same ones as MENU_ITEM_DESTRUCTIVE and Banner's error variant)
   * for content that reports a validation or failure state.
   * @default "default"
   */
  readonly tone?: 'default' | 'danger';
}

/**
 * Tooltip content with tokenized surface styling.
 * z-tooltip to sit above shell chrome, right rails, popovers, and drawers.
 * Collision-safe by default: avoidCollisions + collisionPadding (8px) keep the
 * content fully inside the viewport for far-edge triggers (e.g. header rail
 * toggle at the far right) while flipping/shifting as needed.
 * Pure opacity reveal only (fade-in/out) — no decorative zoom or slide/translate
 * per DESIGN.md + .claude/rules/ui.md "No Decorative Hover Motion" + subtraction.
 * Complements shell Tooltip (support-8) + DspAvatarStack pure opacity updates.
 * Includes reduced motion support and accessibility features.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(
  (
    {
      className,
      sideOffset = OVERLAY_SIDE_OFFSET,
      collisionPadding = OVERLAY_COLLISION_PADDING,
      showArrow = false,
      contentVariant = 'rich',
      tone = 'default',
      children,
      testId = 'tooltip-content',
      style,
      ...props
    },
    ref
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        data-testid={testId}
        data-tooltip-content-variant={contentVariant}
        style={{
          maxWidth:
            'min(14rem, var(--radix-tooltip-content-available-width, 14rem))',
          ...style,
        }}
        className={cn(
          // Every overlay shares the same tokenized rounded rectangle. The
          // content contract describes intent; short labels stay on one line
          // when space allows, and long labels wrap without clipping.
          'z-tooltip flex items-center gap-2 max-w-56 break-words whitespace-normal px-2 py-1 text-xs font-normal leading-normal tracking-tight',
          tone === 'danger' ? TOOLTIP_SURFACE_DANGER : TOOLTIP_SURFACE_BASE,
          OVERLAY_CONTENT_RADIUS,
          // Pure opacity reveal (fade only) — subtract decorative zoom + slide-ins.
          // Matches parallel support work on shell Tooltip / Dsp for visual parity.
          // No layout shift; cursor-near friendly.
          DROPDOWN_TRANSITIONS,
          // Reduced motion keeps the opacity transition legible without spatial motion.
          'motion-reduce:transition-opacity motion-reduce:duration-150',
          className
        )}
        // Accessibility: ensure proper collision avoidance
        avoidCollisions={true}
        {...props}
      >
        {children}
        {showArrow && (
          <TooltipPrimitive.Arrow
            className='fill-surface-tooltip'
            data-testid='tooltip-arrow'
          />
        )}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export type { TooltipContentProps };
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
