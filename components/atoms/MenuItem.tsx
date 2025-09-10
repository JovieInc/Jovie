import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

export interface MenuItemProps
  extends Omit<ButtonProps, 'variant' | 'size' | 'color'> {
  icon?: LucideIcon;
  variant?: 'default' | 'danger';
}

export const MenuItem = React.forwardRef<
  HTMLButtonElement | HTMLAnchorElement,
  MenuItemProps
>(({ icon: Icon, children, className, variant = 'default', ...props }, ref) => {
  return (
    <Button
      ref={ref}
      variant='ghost'
      className={cn(
        'w-full justify-start gap-3 rounded-md px-3 py-2 text-sm',
        variant === 'danger'
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50',
        className
      )}
      role='menuitem'
      {...props}
    >
      {Icon && <Icon className='h-4 w-4 flex-shrink-0' />}
      <span>{children}</span>
    </Button>
  );
});

MenuItem.displayName = 'MenuItem';
