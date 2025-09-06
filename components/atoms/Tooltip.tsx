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
} from '@floating-ui/react';
import { type ReactNode, useId, useRef, useState } from 'react';

export interface TooltipProps {
  /**
   * Content displayed inside the tooltip. Provide plain text or
   * accessible markup so screen readers can communicate the message
   * effectively.
   */
  content: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  shortcut?: string;
  children: ReactNode;
}

export function Tooltip({
  content,
  placement = 'right',
  shortcut,
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
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      arrowMw({ element: arrowRef }),
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
            style={floatingStyles}
            {...getFloatingProps({
              id: tooltipId,
            })}
            className='z-[60] relative select-none rounded-xl px-2.5 py-1.5 text-[11px] font-medium shadow-xl ring-1 backdrop-blur-sm will-change-transform bg-white text-neutral-900 ring-black/10 dark:bg-black/90 dark:text-white dark:ring-white/20'
          >
            <div className='flex items-center gap-2 whitespace-nowrap'>
              {typeof content === 'string' ? <span>{content}</span> : content}
              {shortcut ? (
                <kbd className='ml-1 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ring-1 bg-black/5 text-neutral-700 ring-black/10 dark:bg-white/10 dark:text-white dark:ring-white/20'>
                  {shortcut}
                </kbd>
              ) : null}
            </div>
            <div
              ref={arrowRef}
              className='absolute h-2 w-2 rotate-45 bg-white ring-1 ring-black/10 dark:bg-black/90 dark:ring-white/20 pointer-events-none'
              style={{
                left:
                  middlewareData.arrow?.x != null
                    ? `${middlewareData.arrow.x}px`
                    : '',
                top:
                  middlewareData.arrow?.y != null
                    ? `${middlewareData.arrow.y}px`
                    : '',
                // Anchor the arrow to the static side (edge closest to the reference)
                // Overlap by 1px to visually merge the arrow's ring with the bubble ring
                ...(placement.startsWith('top')
                  ? { bottom: '-5px' }
                  : placement.startsWith('right')
                    ? { left: '-5px' }
                    : placement.startsWith('bottom')
                      ? { top: '-5px' }
                      : placement.startsWith('left')
                        ? { right: '-5px' }
                        : {}),
              }}
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
