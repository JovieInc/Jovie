'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { QuickActionBadge, SmartBadge } from '@/components/atoms/SmartBadge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
  useOptimisticNavigation,
  usePreloadRoutes,
} from '@/hooks/usePerformanceOptimizations';
import { cn } from '@/lib/utils';

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: React.ComponentType<{ className?: string }>;
    isActive?: boolean;
    badge?: {
      variant?: 'dot' | 'count' | 'status' | 'new' | 'pro';
      count?: number;
      status?: 'active' | 'warning' | 'error' | 'success' | 'info';
      pulse?: boolean;
      children?: React.ReactNode;
    };
    quickAction?: {
      icon: React.ComponentType<{ className?: string }>;
      label: string;
      onClick?: () => void;
    };
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  // Keyboard shortcut mapping for main navigation
  const shortcutKeys = ['1', '2', '3', '4'];
  const pathname = usePathname();
  const { preloadRoute } = usePreloadRoutes();
  const { isPending, navigateOptimistically } = useOptimisticNavigation();

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item, index) => {
          const isActive =
            pathname === item.url ||
            (pathname === '/dashboard' && item.url === '/dashboard/overview');
          const shortcutKey = shortcutKeys[index];

          return (
            <Collapsible key={item.title} asChild defaultOpen={item.isActive}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={`${item.title} (Press ${shortcutKey})`}
                  isActive={isActive}
                >
                  <Link
                    href={item.url}
                    className={cn(
                      'group relative overflow-hidden rounded-lg',
                      'transition-all duration-300 ease-out',
                      isPending && 'opacity-75',
                      isActive && 'bg-sidebar-accent/50'
                    )}
                    onMouseEnter={() => preloadRoute(item.url)}
                    onClick={e => {
                      if (item.url !== pathname) {
                        e.preventDefault();
                        navigateOptimistically(item.url);
                      }
                    }}
                  >
                    {/* Linear-inspired hover background effect */}
                    <div className='absolute inset-0 bg-gradient-to-r from-sidebar-accent/0 to-sidebar-accent/60 scale-x-0 group-hover:scale-x-100 transition-transform duration-300 ease-out origin-left' />

                    {/* Enhanced active state indicator */}
                    {isActive && (
                      <>
                        <div className='absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 bg-sidebar-primary rounded-r-full transition-all duration-300' />
                        <div className='absolute inset-0 bg-sidebar-accent/30 rounded-lg' />
                      </>
                    )}

                    {/* Subtle glow effect on hover */}
                    <div className='absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300'>
                      <div className='absolute inset-0 bg-gradient-to-r from-transparent via-sidebar-primary/5 to-transparent' />
                    </div>

                    <item.icon
                      className={cn(
                        'h-5 w-5 relative z-10 transition-all duration-300 ease-out',
                        'group-hover:scale-110 group-hover:rotate-3',
                        isActive
                          ? 'text-sidebar-primary scale-105'
                          : 'text-sidebar-foreground'
                      )}
                    />
                    <span
                      className={cn(
                        'flex-1 relative z-10 transition-all duration-300 ease-out',
                        'group-hover:translate-x-1',
                        isActive
                          ? 'text-sidebar-primary font-medium'
                          : 'text-sidebar-foreground'
                      )}
                    >
                      {item.title}
                    </span>

                    <div className='flex items-center gap-1 relative z-10'>
                      {item.badge && <SmartBadge {...item.badge} />}
                      {item.quickAction && (
                        <QuickActionBadge
                          icon={item.quickAction.icon}
                          label={item.quickAction.label}
                          onClick={item.quickAction.onClick}
                          className='opacity-0 group-hover:opacity-100 transition-opacity'
                        />
                      )}
                      {shortcutKey && (
                        <kbd className='pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded-md border border-sidebar-border bg-sidebar-surface/80 backdrop-blur-sm px-1.5 font-mono text-[10px] font-medium text-sidebar-muted-foreground opacity-0 group-hover:opacity-100 transition-all duration-300 ease-out group-hover:scale-105 group-hover:bg-sidebar-accent group-hover:text-sidebar-accent-foreground shadow-sm'>
                          {shortcutKey}
                        </kbd>
                      )}
                    </div>
                  </Link>
                </SidebarMenuButton>
                {item.items?.length ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className='data-[state=open]:rotate-90'>
                        <ChevronRight />
                        <span className='sr-only'>Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items?.map(subItem => (
                          <SidebarMenuSubItem key={subItem.title}>
                            <SidebarMenuSubButton asChild>
                              <Link href={subItem.url}>
                                <span>{subItem.title}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
