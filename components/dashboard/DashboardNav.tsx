'use client';

import {
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BellIcon,
  ChartPieIcon,
  DocumentDuplicateIcon,
  HomeIcon,
  IdentificationIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserCircleIcon,
  UserPlusIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { Kbd } from '@jovie/ui';
import { useFeatureGate } from '@statsig/react-bindings';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboardData } from '@/app/app/dashboard/DashboardDataContext';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuActions,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { STATSIG_FLAGS } from '@/lib/statsig/flags';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface DashboardNavProps {
  collapsed?: boolean;
}

// Primary Navigation - Core features
const primaryNavigation = [
  {
    name: 'Overview',
    href: '/app/dashboard/overview',
    id: 'overview',
    icon: HomeIcon,
    description: 'Dashboard overview and quick stats',
  },
  {
    name: 'Profile',
    href: '/app/dashboard/profile',
    id: 'links',
    icon: UserCircleIcon,
    description: 'Update your profile and links',
  },
  {
    name: 'Contacts',
    href: '/app/dashboard/contacts',
    id: 'contacts',
    icon: IdentificationIcon,
    description: 'Manage your team and contact routes',
  },
  {
    name: 'Audience',
    href: '/app/dashboard/audience',
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
  audience: '4',
  tipping: '5',
};

const secondaryNavigation = [
  {
    name: 'Earnings',
    href: '/app/dashboard/tipping',
    id: 'tipping',
    icon: BanknotesIcon,
    description: 'Manage tips and monetization',
  },
];

const settingsNavigation = [
  {
    name: 'Account',
    href: '/app/settings/account',
    id: 'account',
    icon: ShieldCheckIcon,
  },
  {
    name: 'Appearance',
    href: '/app/settings/appearance',
    id: 'appearance',
    icon: PaintBrushIcon,
  },
  {
    name: 'Notifications',
    href: '/app/settings/notifications',
    id: 'notifications',
    icon: BellIcon,
  },
  {
    name: 'Remove Branding',
    href: '/app/settings/remove-branding',
    id: 'remove-branding',
    icon: SparklesIcon,
  },
  {
    name: 'Ad Pixels',
    href: '/app/settings/ad-pixels',
    id: 'ad-pixels',
    icon: RocketLaunchIcon,
  },
  {
    name: 'Billing',
    href: '/app/settings/billing',
    id: 'billing',
    icon: BanknotesIcon,
  },
];

const adminNavigation: typeof primaryNavigation = [
  {
    name: 'Overview',
    href: '/app/admin',
    id: 'admin_overview',
    icon: ShieldCheckIcon,
    description: 'Internal metrics and operations',
  },
  {
    name: 'Waitlist',
    href: '/app/admin/waitlist',
    id: 'admin_waitlist',
    icon: UserPlusIcon,
    description: 'Review and manage waitlist signups',
  },
  {
    name: 'Creators',
    href: '/app/admin/creators',
    id: 'admin_creators',
    icon: UsersIcon,
    description: 'Manage creator profiles and verification',
  },
  {
    name: 'Users',
    href: '/app/admin/users',
    id: 'admin_users',
    icon: UserCircleIcon,
    description: 'Review signed up users and billing status',
  },
  {
    name: 'Activity',
    href: '/app/admin/activity',
    id: 'admin_activity',
    icon: ChartPieIcon,
    description: 'Review recent system and creator activity',
  },
];

export function DashboardNav(_props: DashboardNavProps) {
  void _props;
  const { isAdmin, selectedProfile } = useDashboardData();
  const pathname = usePathname();
  const notifications = useNotifications();
  const contactsGate = useFeatureGate(STATSIG_FLAGS.CONTACTS);
  const username =
    selectedProfile?.usernameNormalized ?? selectedProfile?.username;
  const publicProfileHref = username ? `/${username}` : undefined;
  const primaryItems = contactsGate.value
    ? primaryNavigation
    : primaryNavigation.filter(item => item.id !== 'contacts');

  const isInSettings = pathname.startsWith('/app/settings');
  const navSections = isInSettings
    ? [settingsNavigation]
    : [primaryItems, secondaryNavigation];

  const renderSection = (
    items: typeof primaryNavigation | typeof settingsNavigation
  ) => (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          pathname === item.href ||
          (pathname.startsWith(`${item.href}/`) && item.href !== '/app/admin');
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
                className='flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0'
              >
                <item.icon className='size-4' aria-hidden='true' />
                <span className='truncate group-data-[collapsible=icon]:hidden'>
                  {item.name}
                </span>
              </Link>
            </SidebarMenuButton>
            {item.href === '/app/dashboard/profile' && publicProfileHref ? (
              <SidebarMenuActions showOnHover>
                <SidebarMenuAction
                  type='button'
                  aria-label='Copy public profile link'
                  onClick={async () => {
                    const url = `${getBaseUrl()}${publicProfileHref}`;

                    const fallbackCopy = (text: string): boolean => {
                      try {
                        const textarea = document.createElement('textarea');
                        textarea.value = text;
                        textarea.style.position = 'fixed';
                        textarea.style.left = '-999999px';
                        textarea.style.top = '-999999px';
                        document.body.appendChild(textarea);
                        textarea.focus();
                        textarea.select();
                        const successful = document.execCommand('copy');
                        document.body.removeChild(textarea);
                        return successful;
                      } catch {
                        return false;
                      }
                    };

                    try {
                      let copySuccess = false;
                      if (
                        navigator.clipboard &&
                        navigator.clipboard.writeText
                      ) {
                        await navigator.clipboard.writeText(url);
                        copySuccess = true;
                      } else {
                        copySuccess = fallbackCopy(url);
                      }

                      if (!copySuccess) {
                        throw new Error('copy_failed');
                      }

                      notifications.success('Copied to clipboard');
                      track('profile_copy_url_click', {
                        status: 'success',
                        source: 'dashboard_nav',
                      });
                    } catch {
                      const success = fallbackCopy(url);
                      if (success) {
                        notifications.success('Copied to clipboard');
                        track('profile_copy_url_click', {
                          status: 'success',
                          source: 'dashboard_nav',
                        });
                        return;
                      }

                      notifications.error('Failed to copy');
                      track('profile_copy_url_click', {
                        status: 'error',
                        source: 'dashboard_nav',
                      });
                    }
                  }}
                >
                  <DocumentDuplicateIcon aria-hidden='true' />
                </SidebarMenuAction>
                <SidebarMenuAction asChild>
                  <Link
                    href={publicProfileHref}
                    target='_blank'
                    rel='noopener noreferrer'
                    aria-label='Open public profile in a new tab'
                  >
                    <ArrowTopRightOnSquareIcon aria-hidden='true' />
                  </Link>
                </SidebarMenuAction>
              </SidebarMenuActions>
            ) : null}
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
      <SidebarGroup className='mb-1 space-y-1.5'>
        <SidebarGroupContent className='space-y-1'>
          {navSections.map((section, idx) => (
            <div key={idx} data-nav-section>
              {renderSection(section)}
            </div>
          ))}
        </SidebarGroupContent>
      </SidebarGroup>
      {isAdmin && !isInSettings && (
        <div className='mt-4'>
          <SidebarCollapsibleGroup label='Admin' defaultOpen>
            {renderSection(adminNavigation)}
          </SidebarCollapsibleGroup>
        </div>
      )}
    </nav>
  );
}
