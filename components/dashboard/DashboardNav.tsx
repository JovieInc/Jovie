'use client';

import {
  BanknotesIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  HomeIcon,
  LinkIcon,
  ShieldCheckIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/dashboard/DashboardDataContext';
import { Divider } from '@/components/atoms/Divider';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';

interface DashboardNavProps {
  collapsed?: boolean;
}

// Primary Navigation - Core features
const primaryNavigation = [
  {
    name: 'Overview',
    href: '/dashboard/overview',
    id: 'overview',
    icon: HomeIcon,
    description: 'Dashboard overview and quick stats',
  },
  {
    name: 'Links',
    href: '/dashboard/links',
    id: 'links',
    icon: LinkIcon,
    description: 'Manage your social and streaming links',
  },
  {
    name: 'Analytics',
    href: '/dashboard/analytics',
    id: 'analytics',
    icon: ChartPieIcon,
    description: 'Track your performance and engagement',
  },
  {
    name: 'Audience',
    href: '/dashboard/audience',
    id: 'audience',
    icon: UsersIcon,
    description: 'Understand your audience demographics',
  },
];

// Keyboard shortcut hints shown in tooltips when the sidebar is collapsed.
// Display-only for now; actual hotkeys can be wired separately.
const navShortcuts: Record<string, string> = {
  overview: '1',
  links: '2',
  analytics: '3',
  audience: '4',
  tipping: '5',
  settings: '6',
};

// Secondary Navigation - Additional features
const secondaryNavigation: typeof primaryNavigation = [
  {
    name: 'Earnings',
    href: '/dashboard/tipping',
    id: 'tipping',
    icon: BanknotesIcon,
    description: 'Manage tips and monetization',
  },
  {
    name: 'Settings',
    href: '/dashboard/settings',
    id: 'settings',
    icon: Cog6ToothIcon,
    description: 'Configure your account and preferences',
  },
];

const adminNavigation: typeof primaryNavigation = [
  {
    name: 'Overview',
    href: '/admin',
    id: 'admin_overview',
    icon: ShieldCheckIcon,
    description: 'Internal metrics and operations',
  },
  {
    name: 'Users',
    href: '/admin/users',
    id: 'admin_users',
    icon: UsersIcon,
    description: 'Manage creator profiles and verification',
  },
  {
    name: 'Activity',
    href: '/admin/activity',
    id: 'admin_activity',
    icon: ChartPieIcon,
    description: 'Review recent system and creator activity',
  },
];

export function DashboardNav({ collapsed = false }: DashboardNavProps) {
  const { isAdmin } = useDashboardData();
  const pathname = usePathname();

  const renderSection = (items: typeof primaryNavigation) => (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href ||
          (pathname === '/dashboard' && item.id === 'overview');

        const shortcut = navShortcuts[item.id];
        const tooltip = shortcut
          ? {
              children: (
                <div className='flex items-center gap-2'>
                  <span>{item.name}</span>
                  <kbd className='text-xs text-tertiary-token border rounded px-1'>
                    {shortcut}
                  </kbd>
                </div>
              ),
            }
          : item.name;

        return (
          <SidebarMenuItem key={item.id}>
            <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className='flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
              >
                <item.icon className='size-4' aria-hidden='true' />
                <span className='truncate group-data-[collapsible=icon]:hidden'>
                  {item.name}
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );

  return (
    <nav
      className='flex flex-1 flex-col'
      aria-label='Dashboard navigation'
      role='navigation'
    >
      {/* Primary Navigation Block */}
      <div className='mb-6'>{renderSection(primaryNavigation)}</div>

      {/* Divider */}
      <Divider className='mb-6' inset={!collapsed} />

      {/* Secondary Navigation Block */}
      <div className='mb-4'>{renderSection(secondaryNavigation)}</div>

      {/* Admin Navigation Block (admins only) */}
      {isAdmin && (
        <div className='mt-2'>
          <Divider className='mb-3' inset={!collapsed} />
          <SidebarGroup>
            <SidebarGroupLabel className='px-2 text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent className='mt-1'>
              {renderSection(adminNavigation)}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      )}
    </nav>
  );
}
