'use client';

import {
  arrow as arrowMw,
  autoUpdate,
  FloatingPortal,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';
import { type ReactNode, useRef, useState } from 'react';

export interface TooltipProps {
  content: string;
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

  const { refs, floatingStyles, context } = useFloating({
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
    delay: { open: 150, close: 50 },
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
        {...getReferenceProps()}
        className='inline-flex'
      >
        {children}
      </span>
      {open && (
        <FloatingPortal>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className='z-[60] select-none rounded-xl bg-black/90 px-2.5 py-1.5 text-[11px] font-medium text-white shadow-lg ring-1 ring-black/40 backdrop-blur will-change-transform'
          >
            <div className='flex items-center gap-2 whitespace-nowrap'>
              <span>{content}</span>
              {shortcut ? (
                <kbd className='ml-1 inline-flex items-center rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-white ring-1 ring-white/20'>
                  {shortcut}
                </kbd>
              ) : null}
            </div>
            <div
              ref={arrowRef}
              className='absolute h-2 w-2 rotate-45 bg-black/90 ring-1 ring-black/40'
            />
          </div>
        </FloatingPortal>
      )}
    </>
  );
}
