'use client';

import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  CalendarDays,
  HandCoins,
  IdCard,
  Lock,
  MailCheck,
  PieChart,
  Settings,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useMemo } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { APP_ROUTES } from '@/constants/routes';
import { useFeatureGate } from '@/lib/feature-flags/client';
import { FEATURE_FLAG_KEYS } from '@/lib/feature-flags/shared';
import { cn } from '@/lib/utils';

interface SettingsNavItem {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly icon: LucideIcon;
}

interface SettingsNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: ReadonlyArray<SettingsNavItem>;
}

function getSettingsNavGroups(options: {
  isAdmin: boolean;
  isStripeConnectEnabled: boolean;
}): ReadonlyArray<SettingsNavGroup> {
  const generalItems: SettingsNavItem[] = [
    {
      id: 'account',
      title: 'Account',
      href: APP_ROUTES.SETTINGS_ACCOUNT,
      icon: ShieldCheck,
    },
    {
      id: 'billing',
      title: 'Billing & Subscription',
      href: APP_ROUTES.SETTINGS_BILLING,
      icon: Banknote,
    },
    ...(options.isStripeConnectEnabled
      ? [
          {
            id: 'payments',
            title: 'Payments',
            href: APP_ROUTES.SETTINGS_PAYMENTS,
            icon: HandCoins,
          },
        ]
      : []),
    {
      id: 'data-privacy',
      title: 'Data & Privacy',
      href: APP_ROUTES.SETTINGS_DATA_PRIVACY,
      icon: Lock,
    },
  ];

  const artistItems: SettingsNavItem[] = [
    {
      id: 'artist-profile',
      title: 'Artist Profile',
      href: APP_ROUTES.SETTINGS_ARTIST_PROFILE,
      icon: UserCircle,
    },
    {
      id: 'contacts',
      title: 'Contacts',
      href: APP_ROUTES.SETTINGS_CONTACTS,
      icon: IdCard,
    },
    {
      id: 'touring',
      title: 'Touring',
      href: APP_ROUTES.SETTINGS_TOURING,
      icon: CalendarDays,
    },
    {
      id: 'analytics',
      title: 'Analytics',
      href: APP_ROUTES.SETTINGS_ANALYTICS,
      icon: PieChart,
    },
    {
      id: 'audience-tracking',
      title: 'Audience & Tracking',
      href: APP_ROUTES.SETTINGS_AUDIENCE,
      icon: MailCheck,
    },
  ];

  const groups: SettingsNavGroup[] = [
    { id: 'general', label: 'General', items: generalItems },
    { id: 'artist', label: 'Artist', items: artistItems },
  ];

  if (options.isAdmin) {
    groups.push({
      id: 'admin',
      label: 'Admin',
      items: [
        {
          id: 'admin',
          title: 'Admin',
          href: APP_ROUTES.SETTINGS_ADMIN,
          icon: Settings,
        },
      ],
    });
  }

  return groups;
}

function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const SettingsSidebar = memo(function SettingsSidebar() {
  const pathname = usePathname();
  const { isAdmin } = useDashboardData();
  const isStripeConnectEnabled = useFeatureGate(
    FEATURE_FLAG_KEYS.STRIPE_CONNECT_ENABLED
  );

  const groups = useMemo(
    () => getSettingsNavGroups({ isAdmin, isStripeConnectEnabled }),
    [isAdmin, isStripeConnectEnabled]
  );

  return (
    <aside className='h-fit' data-testid='settings-sidebar'>
      {/* Desktop sidebar */}
      <div className='hidden max-h-[calc(100vh-4.5rem)] overflow-y-auto rounded-[10px] border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_98%,var(--linear-bg-surface-0))] p-1.5 backdrop-blur-sm lg:block'>
        {groups.map(group => (
          <div key={group.id} className='mb-2 last:mb-0'>
            <p className='mb-1 px-2.5 text-[12px] font-[510] tracking-normal text-sidebar-muted/90'>
              {group.label}
            </p>
            <nav aria-label={`${group.label} settings`}>
              <ul className='space-y-0.5'>
                {group.items.map(item => {
                  const active = isActiveRoute(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex min-h-7 items-center gap-2.5 rounded-[9px] px-2.5 py-1 text-[13px] leading-[1.15] tracking-normal transition-[background-color,border-color,color]',
                          active
                            ? 'border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))] text-primary-token'
                            : 'border border-transparent text-sidebar-item-foreground/78 hover:bg-(--linear-row-hover) hover:text-primary-token'
                        )}
                      >
                        <Icon
                          className='h-3.5 w-3.5 shrink-0'
                          aria-hidden='true'
                        />
                        {item.title}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        ))}
      </div>

      {/* Mobile horizontal scrollable tabs */}
      <nav
        className='flex gap-1 overflow-x-auto pb-2 lg:hidden'
        aria-label='Settings sections'
      >
        {groups.flatMap(group =>
          group.items.map(item => {
            const active = isActiveRoute(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={`${group.id}-${item.id}`}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-[510] tracking-normal transition-[background-color,border-color,color] whitespace-nowrap',
                  active
                    ? 'border border-(--linear-app-frame-seam) bg-[color-mix(in_oklab,var(--linear-app-content-surface)_99%,var(--linear-bg-surface-0))] text-primary-token'
                    : 'border border-transparent text-sidebar-item-foreground/78 hover:bg-(--linear-row-hover) hover:text-primary-token'
                )}
              >
                <Icon className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                {item.title}
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
});
