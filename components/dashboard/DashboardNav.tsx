'use client';

import {
  ArrowLeftIcon,
  BanknotesIcon,
  BellIcon,
  ChartPieIcon,
  Cog6ToothIcon,
  HomeIcon,
  IdentificationIcon,
  LinkIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Kbd } from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
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
import { STATSIG_FLAGS } from '@/lib/statsig/flags';

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
    name: 'Contacts',
    href: '/dashboard/contacts',
    id: 'contacts',
    icon: IdentificationIcon,
    description: 'Manage your team and contact routes',
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
  contacts: '3',
  analytics: '4',
  audience: '5',
  tipping: '6',
  settings: '7',
};

const secondaryNavigation = [
  {
    name: 'Earnings',
    href: '/dashboard/tipping',
    id: 'tipping',
    icon: BanknotesIcon,
    description: 'Manage tips and monetization',
  },
  {
    name: 'Settings',
    href: '/settings',
    id: 'settings',
    icon: Cog6ToothIcon,
    description: 'Configure your account and preferences',
  },
];

const settingsNavigation = [
  {
    name: 'Back to app',
    href: '/dashboard/overview',
    id: 'back',
    icon: ArrowLeftIcon,
  },
  {
    name: 'Profile',
    href: '/settings/profile',
    id: 'profile',
    icon: IdentificationIcon,
  },
  {
    name: 'Account',
    href: '/settings/account',
    id: 'account',
    icon: ShieldCheckIcon,
  },
  {
    name: 'Appearance',
    href: '/settings/appearance',
    id: 'appearance',
    icon: PaintBrushIcon,
  },
  {
    name: 'Notifications',
    href: '/settings/notifications',
    id: 'notifications',
    icon: BellIcon,
  },
  {
    name: 'Remove Branding',
    href: '/settings/remove-branding',
    id: 'remove-branding',
    icon: SparklesIcon,
  },
  {
    name: 'Ad Pixels',
    href: '/settings/ad-pixels',
    id: 'ad-pixels',
    icon: RocketLaunchIcon,
  },
  {
    name: 'Billing',
    href: '/settings/billing',
    id: 'billing',
    icon: BanknotesIcon,
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
  const contactsGate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const primaryItems = contactsGate.value
    ? primaryNavigation
    : primaryNavigation.filter(item => item.id !== 'contacts');

  const isInSettings = pathname.startsWith('/settings');
  const activeItems = isInSettings ? settingsNavigation : primaryItems;

  const renderSection = (
    items: typeof primaryNavigation | typeof settingsNavigation
  ) => (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const shortcut = navShortcuts[item.id];
        const tooltip = shortcut
          ? {
            children: (
              <div className='flex items-center gap-2'>
                <span>{item.name}</span>
                <Kbd className='text-[10px] px-1.5 py-0.5'>{shortcut}</Kbd>
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
                className='flex h-8 w-full min-w-0 items-center gap-2 px-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0'
              >
                <item.icon className='size-5' aria-hidden='true' />
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
      <SidebarGroup className='mb-1'>
        <SidebarGroupContent>{renderSection(activeItems)}</SidebarGroupContent>
      </SidebarGroup>
      {!isInSettings && (
        <SidebarGroup className='mt-0'>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            {renderSection(secondaryNavigation)}
          </SidebarGroupContent>
        </SidebarGroup>
      )}
      {/* Admin Navigation Block (admins only) */}
      {isAdmin && (
        <div className='mt-1.5'>
          <Divider className='mb-2' inset={!collapsed} />
          <SidebarGroup>
            <SidebarGroupLabel className='px-2 text-xs font-semibold uppercase tracking-wide text-tertiary-token'>
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent className='mt-0.5'>
              {renderSection(adminNavigation)}
            </SidebarGroupContent>
          </SidebarGroup>
        </div>
      )}
    </nav>
  );
}
