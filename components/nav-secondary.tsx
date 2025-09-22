import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as React from 'react';

import { SmartBadge } from '@/components/atoms/SmartBadge';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: {
      variant?: 'dot' | 'count' | 'status' | 'new' | 'pro';
      count?: number;
      status?: 'active' | 'warning' | 'error' | 'success' | 'info';
      pulse?: boolean;
      children?: React.ReactNode;
    };
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname();
  // Keyboard shortcut mapping for secondary navigation (starts at 5)
  const shortcutKeys = ['5', '6'];

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item, index) => {
            const isActive = pathname === item.url;
            const shortcutKey = shortcutKeys[index];

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild size='sm' isActive={isActive}>
                  <Link
                    href={item.url}
                    className='group relative overflow-hidden'
                  >
                    <div className='absolute inset-0 bg-sidebar-accent scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ease-out origin-left' />
                    <item.icon className='h-4 w-4 relative z-10 transition-all duration-200 group-hover:scale-110' />
                    <span className='flex-1 relative z-10 transition-all duration-200'>
                      {item.title}
                    </span>

                    <div className='flex items-center gap-1 relative z-10'>
                      {item.badge && <SmartBadge {...item.badge} />}
                      {shortcutKey && (
                        <kbd className='pointer-events-none inline-flex h-4 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar-accent px-1 font-mono text-[9px] font-medium text-sidebar-accent-foreground opacity-60 group-hover:opacity-100 transition-all duration-200 group-hover:scale-105'>
                          {shortcutKey}
                        </kbd>
                      )}
                    </div>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
