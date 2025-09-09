'use client';

import {
  arrow as arrowMw,
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
  size,
  autoPlacement,
  hide,
} from '@floating-ui/react';
import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react';

export interface TooltipProps {
  /**
   * Content displayed inside the tooltip. Provide plain text or
   * accessible markup so screen readers can communicate the message
   * effectively.
   */
  content: ReactNode;
  /** Preferred placement of the tooltip */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Keyboard shortcut to display */
  shortcut?: string;
  /** Maximum width of the tooltip in pixels */
  maxWidth?: number;
  /** Whether to wrap text in the tooltip */
  wrapText?: boolean;
  /** Additional class name for the tooltip */
  className?: string;
  /** Child element that triggers the tooltip */
  children: ReactNode;
}

export function Tooltip({
  content,
  placement = 'right',
  shortcut,
  maxWidth = 240,
  wrapText = true,
  className = '',
  children,
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<HTMLDivElement | null>(null);
  const tooltipId = useId();

  const { refs, floatingStyles, context, middlewareData } = useFloating({
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    placement,
    middleware: [
      offset(8),
      flip({
        padding: 8,
        fallbackAxisSideDirection: 'start',
        fallbackStrategy: 'initialPlacement',
      }),
      shift({ padding: 8 }),
      arrowMw({ element: arrowRef, padding: 4 }),
      size({
        apply({ availableWidth, availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxWidth: `${Math.min(availableWidth - 16, maxWidth)}px`,
            maxHeight: `${availableHeight - 16}px`,
          });
        },
        padding: 8,
      }),
      hide({
        padding: 8,
        boundary: 'clippingAncestors',
      }),
      autoPlacement({
        allowedPlacements: ['top', 'right', 'bottom', 'left'],
        padding: 8,
      }),
    ],
    strategy: 'fixed',
  });

  const hover = useHover(context, {
    move: false,
    delay: { open: 120, close: 60 },
    handleClose: safePolygon({ blockPointerEvents: true }),
  });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <>
      <span
        ref={refs.setReference}
        {...getReferenceProps({
          'aria-describedby': open ? tooltipId : undefined,
        })}
        className='inline-flex'
      >
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            {...getFloatingProps({
              id: tooltipId,
            })}
            className={`z-[60] relative select-none rounded-xl px-2.5 py-1.5 text-[11px] font-medium shadow-xl ring-1 backdrop-blur-sm will-change-transform bg-white text-neutral-900 ring-black/10 dark:bg-black/90 dark:text-white dark:ring-white/20 ${className}`}
            style={{
              ...floatingStyles,
              '--max-width': `${maxWidth}px`,
              maxWidth: 'var(--max-width)',
              ...(middlewareData.hide?.referenceHidden && {
                visibility: 'hidden',
              }),
            } as CSSProperties}
          >
            <div className={`flex items-center gap-2 ${wrapText ? 'whitespace-normal break-words' : 'whitespace-nowrap'}`}>
              {typeof content === 'string' ? <span>{content}</span> : content}
              {shortcut && (
                <kbd className='shrink-0 ml-1.5 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ring-1 bg-black/5 text-neutral-700 ring-black/10 dark:bg-white/10 dark:text-white dark:ring-white/20'>
                  {shortcut}
                </kbd>
              )}
            </div>
            <div
              ref={arrowRef}
              className='absolute h-3 w-3 -z-10 rotate-45 bg-white dark:bg-black/90 ring-1 ring-black/10 dark:ring-white/20 pointer-events-none'
              style={{
                ...(placement.startsWith('right')
                  ? { left: '-6px' }
                  : placement.startsWith('left')
                    ? { right: '-6px' }
                    : { left: middlewareData.arrow?.x ? `${middlewareData.arrow.x}px` : '' }),
                ...(placement.startsWith('bottom') 
                  ? { top: '-6px' }
                  : { top: middlewareData.arrow?.y ? `${middlewareData.arrow.y}px` : '' }),
                [placement === 'top' ? 'bottom' : 'top']: '-4px',
                [placement === 'left' ? 'right' : 'left']: '0px',
                opacity: middlewareData.hide?.referenceHidden ? 0 : 1,
                transition: 'opacity 0.1s ease-out'
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
