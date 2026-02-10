'use client';

import { cn } from '@/lib/utils';

export interface DrawerNavItem<T extends string = string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: React.ReactNode;
}

interface DrawerNavProps<T extends string = string> {
  readonly items: readonly DrawerNavItem<T>[];
  readonly value: T;
  readonly onValueChange: (value: T) => void;
}

export function DrawerNav<T extends string = string>({
  items,
  value,
  onValueChange,
}: DrawerNavProps<T>) {
  return (
    <nav
      className='flex w-full gap-px px-3 py-1'
      aria-label='Drawer navigation'
    >
      {items.map(item => (
        <button
          key={item.value}
          type='button'
          role='tab'
          aria-selected={item.value === value}
          onClick={() => onValueChange(item.value)}
          className={cn(
            // Base — matches SidebarMenuButton
            'flex items-center gap-2 rounded px-2 py-0.5 text-[13px] font-normal leading-tight',
            'transition-all duration-150 ease-out',
            // Icon styling
            '[&>svg]:size-4 [&>svg]:shrink-0',
            // Inactive
            'text-sidebar-item-foreground',
            'hover:text-sidebar-foreground hover:bg-sidebar-accent',
            // Active — matches sidebar active state
            item.value === value &&
              'bg-sidebar-accent-active text-sidebar-foreground [&>svg]:text-sidebar-foreground',
            // Inactive icon color
            item.value !== value &&
              '[&>svg]:text-sidebar-item-icon hover:[&>svg]:text-sidebar-item-foreground'
          )}
        >
          {item.icon}
          <span className='truncate'>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
