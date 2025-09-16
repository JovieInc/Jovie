'use client';

import {
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@jovie/ui';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { PanelLeft } from 'lucide-react';
import * as React from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

const SIDEBAR_KEYBOARD_SHORTCUT = 'b';

type SidebarContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  isMobile: boolean;
};

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

function useSidebarContext(component: string): SidebarContextValue {
  const context = React.useContext(SidebarContext);

  if (!context) {
    throw new Error(`${component} must be used within a <SidebarProvider />`);
  }

  return context;
}

export interface SidebarProviderProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function SidebarProvider({
  children,
  open,
  defaultOpen = true,
  onOpenChange,
}: SidebarProviderProps) {
  const isMobile = useIsMobile();
  const isControlled = open !== undefined;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const resolvedOpen = isControlled ? Boolean(open) : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(next);
      }

      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const toggleOpen = React.useCallback(() => {
    setOpen(!resolvedOpen);
  }, [resolvedOpen, setOpen]);

  React.useEffect(() => {
    if (isMobile) {
      setOpen(false);
    }
  }, [isMobile, setOpen]);

  React.useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!event) return;

      const key = event.key.toLowerCase();
      if (
        (event.metaKey || event.ctrlKey) &&
        key === SIDEBAR_KEYBOARD_SHORTCUT
      ) {
        event.preventDefault();
        toggleOpen();
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [toggleOpen]);

  const value = React.useMemo(
    () => ({ open: resolvedOpen, setOpen, toggleOpen, isMobile }),
    [resolvedOpen, setOpen, toggleOpen, isMobile]
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

const sidebarVariants = cva(
  'group/sidebar-wrapper relative hidden h-full shrink-0 flex-col border-r border-subtle bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-linear lg:flex',
  {
    variants: {
      variant: {
        default: 'bg-sidebar',
        inset: 'bg-base/80 backdrop-blur supports-[backdrop-filter]:bg-base/60',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  variant?: 'default' | 'inset';
}

export function Sidebar({
  className,
  children,
  variant = 'default',
  ...props
}: SidebarProps) {
  const { open, setOpen, isMobile } = useSidebarContext('Sidebar');

  const stateProps = React.useMemo(
    () => ({
      'data-state': open ? 'expanded' : 'collapsed',
      'data-collapsible': open ? 'expanded' : 'icon',
    }),
    [open]
  );

  if (isMobile) {
    return (
      <>
        <div
          aria-hidden
          className={cn(
            'fixed inset-0 z-40 bg-base/80 backdrop-blur-sm transition-opacity duration-200 ease-out lg:hidden',
            open
              ? 'pointer-events-auto opacity-100'
              : 'pointer-events-none opacity-0'
          )}
          onClick={() => setOpen(false)}
        />
        <div
          {...props}
          {...stateProps}
          role='dialog'
          aria-modal='true'
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-72 max-w-full flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-transform duration-200 ease-out lg:hidden',
            open ? 'translate-x-0' : '-translate-x-full',
            className
          )}
        >
          {children}
        </div>
      </>
    );
  }

  return (
    <aside
      {...props}
      {...stateProps}
      className={cn(
        sidebarVariants({ variant }),
        open ? 'w-64' : 'w-16',
        className
      )}
    >
      {children}
    </aside>
  );
}

export type SidebarInsetProps = React.HTMLAttributes<HTMLDivElement>;

export function SidebarInset({ className, ...props }: SidebarInsetProps) {
  return (
    <div
      data-sidebar-inset
      className={cn('flex flex-1 flex-col', className)}
      {...props}
    />
  );
}

export type SidebarSectionProps = React.HTMLAttributes<HTMLDivElement>;

export function SidebarHeader({ className, ...props }: SidebarSectionProps) {
  return (
    <div
      className={cn('flex items-center px-3 pb-2 pt-3', className)}
      {...props}
    />
  );
}

export function SidebarContent({ className, ...props }: SidebarSectionProps) {
  return (
    <div
      className={cn('flex-1 overflow-y-auto px-2 py-3', className)}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: SidebarSectionProps) {
  return (
    <div
      className={cn('mt-auto border-t border-subtle px-2 py-3', className)}
      {...props}
    />
  );
}

export type SidebarMenuProps = React.HTMLAttributes<HTMLUListElement>;

export function SidebarMenu({ className, ...props }: SidebarMenuProps) {
  return <ul role='list' className={cn('grid gap-1', className)} {...props} />;
}

export type SidebarMenuItemProps = React.LiHTMLAttributes<HTMLLIElement>;

export function SidebarMenuItem({ className, ...props }: SidebarMenuItemProps) {
  return <li className={cn('list-none', className)} {...props} />;
}

const sidebarMenuButtonVariants = cva(
  'flex w-full items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
  {
    variants: {
      size: {
        default: 'h-9 py-2',
        lg: 'h-12 py-3 text-base',
      },
      isActive: {
        false: 'text-sidebar-foreground hover:bg-sidebar-accent/60',
        true: 'bg-sidebar-accent text-sidebar-accent-foreground',
      },
    },
    defaultVariants: {
      size: 'default',
      isActive: false,
    },
  }
);

export interface SidebarMenuButtonProps
  extends React.ComponentPropsWithoutRef<'button'> {
  asChild?: boolean;
  isActive?: boolean;
  tooltip?: string;
  size?: 'default' | 'lg';
}

export const SidebarMenuButton = React.forwardRef<
  HTMLElement,
  SidebarMenuButtonProps
>(
  (
    {
      asChild = false,
      className,
      children,
      isActive = false,
      tooltip,
      size = 'default',
      type: typeProp,
      ...props
    },
    forwardedRef
  ) => {
    const { open, isMobile } = useSidebarContext('SidebarMenuButton');
    const Component = asChild ? Slot : 'button';
    const componentProps = asChild
      ? props
      : ({
          type:
            (typeProp as React.ButtonHTMLAttributes<HTMLButtonElement>['type']) ??
            'button',
          ...props,
        } as React.ComponentPropsWithoutRef<'button'>);

    const setRefValue = (node: HTMLElement | null) => {
      if (!forwardedRef) return;

      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
        return;
      }

      if ('current' in forwardedRef) {
        (forwardedRef as React.MutableRefObject<HTMLElement | null>).current =
          node;
      }
    };

    const assignElementRef: React.RefCallback<HTMLElement> = node => {
      setRefValue(node);
    };

    const assignButtonRef: React.RefCallback<HTMLButtonElement> = node => {
      setRefValue(node);
    };

    const button = (
      <Component
        ref={asChild ? assignElementRef : assignButtonRef}
        className={cn(
          sidebarMenuButtonVariants({ size, isActive }),
          !open && !isMobile ? 'justify-center px-0' : 'justify-start',
          className
        )}
        {...componentProps}
      >
        {children}
      </Component>
    );

    if (!open && !isMobile) {
      const label =
        tooltip ??
        (typeof children === 'string'
          ? children
          : (componentProps as { 'aria-label'?: string })['aria-label']) ??
        'Menu item';

      return (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>{button}</TooltipTrigger>
            <TooltipContent side='right'>{label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  }
);
SidebarMenuButton.displayName = 'SidebarMenuButton';

export type SidebarTriggerProps = React.ComponentPropsWithoutRef<typeof Button>;

export const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  SidebarTriggerProps
>(({ className, ...props }, ref) => {
  const { toggleOpen, open } = useSidebarContext('SidebarTrigger');

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            ref={ref}
            variant='ghost'
            size='icon'
            aria-label='Toggle sidebar'
            aria-expanded={open}
            onClick={() => toggleOpen()}
            className={cn('h-8 w-8', className)}
            {...props}
          >
            <PanelLeft className='h-4 w-4' />
          </Button>
        </TooltipTrigger>
        <TooltipContent side='bottom' align='start'>
          Toggle sidebar
          <span className='ml-2 text-xs text-muted-foreground'>
            ⌘+{SIDEBAR_KEYBOARD_SHORTCUT.toUpperCase()}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
SidebarTrigger.displayName = 'SidebarTrigger';

export type SidebarRailProps = React.HTMLAttributes<HTMLDivElement>;

export function SidebarRail({ className, ...props }: SidebarRailProps) {
  const { open } = useSidebarContext('SidebarRail');

  return (
    <div
      aria-hidden
      data-state={open ? 'expanded' : 'collapsed'}
      className={cn(
        'pointer-events-none absolute inset-y-0 right-0 hidden w-px translate-x-full bg-sidebar-border/60 lg:block',
        !open && 'translate-x-0',
        className
      )}
      {...props}
    />
  );
}
