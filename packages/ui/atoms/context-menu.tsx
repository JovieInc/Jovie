'use client';

import * as ContextMenuPrimitive from '@radix-ui/react-context-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';

const glassBaseTransitions =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 ';

const glassPositioning =
  'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 ' +
  'data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 ' +
  'origin-[--radix-context-menu-content-transform-origin]';

const contentBaseClasses =
  'z-50 max-h-[var(--radix-context-menu-content-available-height)] min-w-[10rem] overflow-y-auto overflow-x-hidden rounded-xl border border-subtle bg-surface-1 p-2 text-primary-token shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5 dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] dark:ring-white/5 ' +
  glassBaseTransitions +
  glassPositioning;

const subContentBaseClasses =
  'z-50 min-w-[10rem] overflow-hidden rounded-xl border border-subtle bg-surface-1 p-2 text-primary-token shadow-[0_12px_40px_rgba(0,0,0,0.12)] ring-1 ring-black/5 dark:shadow-[0_18px_60px_rgba(0,0,0,0.55)] dark:ring-white/5 ' +
  glassBaseTransitions +
  glassPositioning;

const ContextMenu = ContextMenuPrimitive.Root;

const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

const ContextMenuGroup = ContextMenuPrimitive.Group;

const ContextMenuPortal = ContextMenuPrimitive.Portal;

const ContextMenuSub = ContextMenuPrimitive.Sub;

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean;
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none text-secondary-token transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token data-disabled:pointer-events-none data-disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-(--color-bg-surface-1) [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      inset && 'pl-10',
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className='ml-auto' />
  </ContextMenuPrimitive.SubTrigger>
));
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName;

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent> & {
    portalProps?: React.ComponentPropsWithoutRef<
      typeof ContextMenuPrimitive.Portal
    >;
    disablePortal?: boolean;
  }
>(({ className, portalProps, disablePortal = false, ...props }, ref) => {
  const content = (
    <ContextMenuPrimitive.SubContent
      ref={ref}
      className={cn(subContentBaseClasses, className)}
      {...props}
    />
  );

  if (disablePortal) {
    return content;
  }

  return (
    <ContextMenuPrimitive.Portal {...portalProps}>
      {content}
    </ContextMenuPrimitive.Portal>
  );
});
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName;

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content> & {
    portalProps?: React.ComponentPropsWithoutRef<
      typeof ContextMenuPrimitive.Portal
    >;
    disablePortal?: boolean;
  }
>(({ className, portalProps, disablePortal = false, ...props }, ref) => {
  const content = (
    <ContextMenuPrimitive.Content
      ref={ref}
      className={cn(contentBaseClasses, className)}
      {...props}
    />
  );

  if (disablePortal) {
    return content;
  }

  return (
    <ContextMenuPrimitive.Portal {...portalProps}>
      {content}
    </ContextMenuPrimitive.Portal>
  );
});
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName;

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors duration-150 ease-out text-secondary-token hover:bg-surface-2 hover:text-primary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token data-disabled:pointer-events-none data-disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-(--color-bg-surface-1) [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
      inset && 'pl-10',
      className
    )}
    {...props}
  />
));
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName;

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-10 pr-3 text-sm outline-none transition-colors duration-150 ease-out text-secondary-token hover:bg-surface-2 hover:text-primary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token data-disabled:pointer-events-none data-disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-(--color-bg-surface-1)',
      className
    )}
    checked={checked}
    {...props}
  >
    <span className='absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
      <ContextMenuPrimitive.ItemIndicator>
        <Check className='h-4 w-4' />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.CheckboxItem>
));
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName;

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-lg py-1.5 pl-10 pr-3 text-sm outline-none transition-colors duration-150 ease-out text-secondary-token hover:bg-surface-2 hover:text-primary-token data-highlighted:bg-surface-2 data-highlighted:text-primary-token data-disabled:pointer-events-none data-disabled:opacity-50 focus-ring-themed focus-visible:ring-offset-(--color-bg-surface-1)',
      className
    )}
    {...props}
  >
    <span className='absolute left-2 flex h-3.5 w-3.5 items-center justify-center'>
      <ContextMenuPrimitive.ItemIndicator>
        <Circle className='h-2 w-2 fill-current' />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
));
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName;

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean;
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-3 py-1 text-xs font-semibold uppercase tracking-wide text-tertiary-token/80',
      inset && 'pl-10',
      className
    )}
    {...props}
  />
));
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName;

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-(--color-border-subtle)/70', className)}
    {...props}
  />
));
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName;

const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        'ml-auto text-[10px] tracking-[0.35em] text-tertiary-token/70',
        className
      )}
      {...props}
    />
  );
};
ContextMenuShortcut.displayName = 'ContextMenuShortcut';

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
};
