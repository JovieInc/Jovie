'use client';

import { Button, Input } from '@jovie/ui';
import { LogOut, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDashboardData } from '@/app/app/(shell)/dashboard/DashboardDataContext';
import { matchesSettingsSearchQuery } from '@/components/features/settings/settings-decision-admission';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { useSidebar } from '@/components/organisms/sidebar';
import { SHELL_RAIL_LABEL } from '@/components/shell/rail-motion';
import { SIDEBAR_ENTRY_LABEL_INSET_CLASS } from '@/components/shell/sidebar-optical';
import {
  artistSettingsNavigation,
  paymentsNavItem,
  type SettingsNavItem,
  userSettingsNavigation,
} from '@/features/dashboard/dashboard-nav/config';
import { useAuthSafe } from '@/hooks/useJovieAuth';
import { useAppFlag } from '@/lib/flags/client';
import { useDashboardProfileQuery } from '@/lib/queries/useDashboardProfileQuery';
import { cn } from '@/lib/utils';
import { SettingsNavGroup } from './SettingsNavGroup';

// Retain the public import while operator navigation uses the eager group only.
export { SettingsNavGroup } from './SettingsNavGroup';

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
  penRail = false,
}: {
  pathname: string;
  section: string;
  penRail?: boolean;
}) {
  const isStripeConnectEnabled = useAppFlag('STRIPE_CONNECT_ENABLED');
  const artistName = useArtistDisplayName();
  const [query, setQuery] = useState('');
  const { signOut } = useAuthSafe();
  const [signingOut, setSigningOut] = useState(false);
  const { state, isMobile } = useSidebar();
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!penRail || state !== 'open') return;
    const focusSettingsSearch = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    globalThis.addEventListener('keydown', focusSettingsSearch);
    return () => globalThis.removeEventListener('keydown', focusSettingsSearch);
  }, [penRail, state]);

  const groups = useMemo(() => {
    const personal = [...userSettingsNavigation];
    if (isStripeConnectEnabled) {
      // Payments sits after Billing & Subscription.
      const billingIndex = personal.findIndex(i => i.id === 'billing');
      personal.splice(billingIndex + 1, 0, paymentsNavItem);
    }
    // The Profile item carries the artist's display name when available.
    const artist =
      artistName && !penRail
        ? artistSettingsNavigation.map(item =>
            item.id === 'artist-profile' ? { ...item, name: artistName } : item
          )
        : artistSettingsNavigation;
    return [
      {
        label: penRail ? 'Account' : 'Personal',
        items: personal,
        artist: false,
      },
      {
        label: penRail ? artistName || 'Artist' : 'Artist',
        items: artist,
        artist: true,
      },
    ].map(group => ({
      ...group,
      items: group.items.filter(item => matchesSettingsSearch(item, query)),
    }));
  }, [artistName, isStripeConnectEnabled, penRail, query]);

  const hasResults = groups.some(group => group.items.length > 0);

  return (
    <nav
      aria-label={`${section} navigation`}
      className={cn(
        'flex flex-col',
        penRail ? 'sidebar-pen-settings gap-3' : 'gap-4'
      )}
    >
      <search className={penRail ? 'sidebar-pen-settings-search' : undefined}>
        <Input
          ref={searchRef}
          type='search'
          aria-keyshortcuts={penRail ? 'Meta+K Control+K' : undefined}
          size='sm'
          aria-label='Search Settings'
          placeholder={penRail ? 'Search settings' : 'Search'}
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        {penRail ? (
          <>
            <Search aria-hidden='true' />
            <kbd
              data-shortcut-glyph='⌘K'
              className='system-b-shell-search-trigger-kbd'
            />
          </>
        ) : null}
      </search>
      {groups
        .filter(group => group.items.length > 0)
        .map(group => {
          const items = (
            <SettingsNavGroup items={group.items} pathname={pathname} />
          );
          return penRail && group.artist ? (
            <SidebarCollapsibleGroup
              key='artist'
              label={group.label}
              className='sidebar-pen-settings-group'
              storageKey='settings.artist'
              forceOpen={query.trim().length > 0}
            >
              {items}
            </SidebarCollapsibleGroup>
          ) : (
            <div key={group.artist ? 'artist' : 'account'}>
              <span className={GROUP_LABEL_CLASS}>{group.label}</span>
              {items}
            </div>
          );
        })}
      {hasResults ? null : (
        <p role='status' className={GROUP_LABEL_CLASS}>
          No settings match
        </p>
      )}
      {penRail ? null : (
        <Button
          type='button'
          variant='ghost'
          size={state === 'closed' && !isMobile ? 'icon-sm' : 'sm'}
          aria-label={signingOut ? 'Signing Out…' : 'Sign Out'}
          className={
            state === 'closed' && !isMobile ? 'justify-center' : 'justify-start'
          }
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true);
            void signOut().finally(() => setSigningOut(false));
          }}
        >
          <LogOut
            aria-hidden='true'
            className='size-(--app-shell-sidebar-icon-size) shrink-0'
          />
          <span className={SHELL_RAIL_LABEL}>
            {signingOut ? 'Signing Out…' : 'Sign Out'}
          </span>
        </Button>
      )}
    </nav>
  );
}
