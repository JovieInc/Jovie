'use client';

import {
  Activity,
  AlertTriangle,
  BarChart2,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  User,
  UserPlus,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { BrandLogo } from '@/components/atoms/BrandLogo';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/organisms/Sidebar';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Overview', href: '/app/admin', icon: LayoutDashboard },
  { label: 'Waitlist', href: '/app/admin/waitlist', icon: UserPlus },
  { label: 'Creators', href: '/app/admin/creators', icon: Users },
  { label: 'Campaigns', href: '/app/admin/campaigns', icon: Mail },
  { label: 'Users', href: '/app/admin/users', icon: User },
  { label: 'Usage', href: '/app/admin#usage', icon: BarChart2 },
  { label: 'Reliability', href: '/app/admin#errors', icon: ShieldCheck },
  { label: 'Activity', href: '/app/admin/activity', icon: Activity },
];

interface AdminSidebarProps {
  className?: string;
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const pathname = usePathname();
  const [hash, setHash] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    // Track hash so items like /admin#usage don't double-highlight
    const updateHash = () => setHash(window.location.hash || '');
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

  const pathWithHash = hash ? `${pathname}${hash}` : pathname;
  const activeHref =
    navItems.find(item => item.href === pathWithHash)?.href ??
    navItems.find(item => item.href === pathname)?.href ??
    null;

  return (
    <Sidebar variant='sidebar' className={className}>
      <SidebarHeader>
        <div className='flex items-center gap-3 px-2 py-1'>
          <Link
            href='/app/admin'
            aria-label='Go to admin dashboard'
            className='flex size-9 items-center justify-center rounded-md transition-all duration-150 ease-out hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
          >
            <BrandLogo size={18} tone='auto' className='size-4' />
          </Link>
          <div className='grid flex-1 text-left leading-tight'>
            <span className='truncate text-sm font-semibold text-sidebar-foreground'>
              Jovie
            </span>
            <span className='truncate text-xs text-sidebar-muted'>
              Admin Console
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <nav
          aria-label='Admin navigation'
          className='flex flex-1 flex-col overflow-hidden'
        >
          <SidebarMenu>
            {navItems.map(item => {
              const isActive = item.href === activeHref;

              return (
                <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive}
                    className='font-medium'
                  >
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className='flex w-full min-w-0 items-center gap-3'
                      onClick={() => {
                        startTransition(() => {
                          // Navigation happens automatically via Next.js
                        });
                      }}
                    >
                      <item.icon
                        className={cn(
                          'size-4',
                          isPending &&
                            'opacity-50 transition-opacity duration-200'
                        )}
                      />
                      <span
                        className={cn(
                          'truncate',
                          isPending &&
                            'opacity-50 transition-opacity duration-200'
                        )}
                      >
                        {item.label}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className='flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent px-3 py-2 text-xs text-sidebar-foreground'>
              <AlertTriangle className='size-4 text-amber-500' />
              <span>Public preview. Do not add secrets here.</span>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
