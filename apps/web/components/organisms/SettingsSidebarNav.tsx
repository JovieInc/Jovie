'use client';

import { Input } from '@jovie/ui';
import { useMemo, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { matchesSettingsSearchQuery } from '@/components/features/settings/settings-decision-admission';
import { SidebarMenu } from '@/components/organisms/sidebar';
import { SHELL_RAIL_LABEL } from '@/components/shell/rail-motion';
import { SIDEBAR_ENTRY_LABEL_INSET_CLASS } from '@/components/shell/sidebar-optical';
import {
  artistSettingsNavigation,
  paymentsNavItem,
  type SettingsNavItem,
  userSettingsNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import { NavMenuItem } from '@/features/dashboard/dashboard-nav/NavMenuItem';
import type { NavItem } from '@/features/dashboard/dashboard-nav/types';
import { useAppFlag } from '@/lib/flags/client';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { cn } from '@/lib/utils';

/** Render a group of nav items */
export function SettingsNavGroup({
  items,
  pathname,
  isItemActive,
  onPrefetch,
}: Readonly<{
  items: readonly NavItem[];
  pathname: string;
  isItemActive?: (item: NavItem) => boolean;
  onPrefetch?: (item: NavItem) => void;
}>) {
  return (
    <SidebarMenu>
      {items.map(item => {
        const isActive =
          isItemActive?.(item) ??
          (pathname === item.href || pathname.startsWith(`${item.href}/`));
        return (
          <NavMenuItem
            key={item.id}
            item={item}
            isActive={isActive}
            calm
            onPrefetch={onPrefetch ? () => onPrefetch(item) : undefined}
          />
        );
      })}
    </SidebarMenu>
  );
}

const GROUP_LABEL_CLASS = cn(
  'mb-1.5 block text-xs font-caption tracking-normal text-sidebar-muted',
  SIDEBAR_ENTRY_LABEL_INSET_CLASS,
  SHELL_RAIL_LABEL
);

/** True when a settings destination matches the sidebar search. */
export function matchesSettingsSearch(
  item: SettingsNavItem,
  query: string
): boolean {
  return matchesSettingsSearchQuery(query, [
    item.name,
    item.description,
    item.admission.userJob,
  ]);
}

function useArtistDisplayName(): string | undefined {
  const { selectedProfile } = useDashboardData();
  // Prefer the TanStack Query cache (updated by profile mutations) over
  // the server-rendered context so the sidebar reflects name edits immediately.
  const { data: cachedProfileData } = useDashboardProfileQuery();
  // Cache may hold either the unwrapped DashboardProfile (from optimistic updates)
  // or the { profile: DashboardProfile } envelope (from server refetch).
  const cachedDisplayName =
    cachedProfileData?.displayName ??
    (
      cachedProfileData as unknown as {
        profile?: { displayName?: string | null };
      }
    )?.profile?.displayName;
  // Only fall back to selectedProfile when cache hasn't loaded yet (undefined/null).
  // If cachedDisplayName is empty string, the user intentionally cleared it.
  return cachedDisplayName == null
    ? selectedProfile?.displayName?.trim() || undefined
    : cachedDisplayName.trim() || undefined;
}

/**
 * Settings rail, Linear style: a search field that filters destinations,
 * then Personal first and the product areas after it, each item an icon and
 * a label with one active item.
 */
export function SettingsNavigation({
  pathname,
  section,
}: {
  pathname: string;
  section: string;
}) {
  const isStripeConnectEnabled = useAppFlag('STRIPE_CONNECT_ENABLED');
  const artistName = useArtistDisplayName();
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const personal = [...userSettingsNavigation];
    if (isStripeConnectEnabled) {
      // Payments sits after Billing & Subscription.
      const billingIndex = personal.findIndex(i => i.id === 'billing');
      personal.splice(billingIndex + 1, 0, paymentsNavItem);
    }
    // The Profile item carries the artist's display name when available.
    const artist = artistName
      ? artistSettingsNavigation.map(item =>
          item.id === 'artist-profile' ? { ...item, name: artistName } : item
        )
      : artistSettingsNavigation;
    return [
      { label: 'Personal', items: personal },
      { label: 'Artist', items: artist },
    ].map(group => ({
      ...group,
      items: group.items.filter(item => matchesSettingsSearch(item, query)),
    }));
  }, [artistName, isStripeConnectEnabled, query]);

  const hasResults = groups.some(group => group.items.length > 0);

  return (
    <nav aria-label={`${section} navigation`} className='flex flex-col gap-4'>
      <search>
        <Input
          type='search'
          size='sm'
          aria-label='Search Settings'
          placeholder='Search'
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
      </search>
      {groups.map(group =>
        group.items.length > 0 ? (
          <div key={group.label}>
            <span className={GROUP_LABEL_CLASS}>{group.label}</span>
            <SettingsNavGroup items={group.items} pathname={pathname} />
          </div>
        ) : null
      )}
      {hasResults ? null : (
        <p role='status' className={GROUP_LABEL_CLASS}>
          No settings match
        </p>
      )}
    </nav>
  );
}
