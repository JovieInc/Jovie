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
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
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

function isElementWithClassName(
  child: ReactNode
): child is ReactElement<{ className?: string }> {
  return (
    isValidElement<{ className?: string }>(child) && child.type !== Fragment
  );
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
  className,
  block,
  open,
  defaultOpen,
}: TooltipProps) {
  const triggerChild = getTriggerChild({ children, className, block });

  return (
    <TooltipProvider delayDuration={120} skipDelayDuration={40}>
      <TooltipRoot open={open} defaultOpen={defaultOpen}>
        <TooltipTrigger asChild>{triggerChild}</TooltipTrigger>
        <TooltipContent
          side={side}
          sideOffset={6}
          style={{ zIndex: 'var(--jovie-shell-overlay-z-index)' }}
          className='flex items-center gap-2 whitespace-nowrap'
        >
          <span>{label}</span>
          {shortcut ? <Kbd variant='tooltip'>{shortcut.keys}</Kbd> : null}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
