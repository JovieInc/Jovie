'use client';

import {
  Activity,
  AlertTriangle,
  BarChart2,
  LayoutDashboard,
  ShieldCheck,
  Users,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

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
  { label: 'Overview', href: '/admin', icon: LayoutDashboard },
  { label: 'Users', href: '/admin#users', icon: Users },
  { label: 'Usage', href: '/admin#usage', icon: BarChart2 },
  { label: 'Reliability', href: '/admin#errors', icon: ShieldCheck },
  { label: 'Activity', href: '/admin#activity', icon: Activity },
];

interface AdminSidebarProps {
  className?: string;
}

export function AdminSidebar({ className }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <Sidebar variant='inset' className={className}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size='lg' className='gap-3'>
              <Link href='/admin' className='flex items-center gap-3'>
                <div className='flex aspect-square size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-sm'>
                  <Image
                    src='/brand/Jovie-Logo-Icon.svg'
                    alt='Jovie'
                    width={18}
                    height={18}
                    className='size-4'
                  />
                </div>
                <div className='grid flex-1 text-left leading-tight'>
                  <span className='truncate text-sm font-semibold'>Jovie</span>
                  <span className='truncate text-xs text-sidebar-foreground/80'>
                    Admin Console
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navItems.map(item => {
            const isActive = item.href === '/admin' && pathname === '/admin';

            return (
              <SidebarMenuItem key={item.label}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  className='font-medium text-secondary-token hover:text-primary-token'
                >
                  <Link href={item.href} className='flex items-center gap-3'>
                    <item.icon className='size-4 text-secondary-token' />
                    <span className={cn('truncate')}>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className='flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar/60 px-3 py-2 text-xs text-sidebar-foreground/90'>
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
