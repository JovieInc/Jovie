'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@/components/organisms/user-button';
import { HOSTNAME } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

export const SIDEBAR_IDENTITY_GROUP_LABEL = 'Creator Identity';
export const SIDEBAR_IDENTITY_GROUP_TEST_ID = 'sidebar-identity-group';
export const SIDEBAR_USER_PANEL_TEST_ID = 'sidebar-user-panel';

export interface SidebarIdentityGroupProps {
  readonly profileHref: string | undefined;
}

function isPublicProfilePath(
  pathname: string | null,
  profileHref: string | undefined
): boolean {
  if (!pathname || !profileHref) return false;
  return pathname === profileHref || pathname.startsWith(`${profileHref}/`);
}

export function formatPublicProfileDisplayHref(profileHref: string): string {
  return `${HOSTNAME}${profileHref}`;
}

export function publicProfileAccessibleName(
  profileDisplayHref: string
): string {
  return `Public Profile ${profileDisplayHref}`;
}

/**
 * One footer identity composition: active creator identity and Public Profile
 * access share a single enclosing group. Actions stay siblings so the group
 * never nests interactive elements or splits one semantic identity across
 * two top-level rows.
 */
export function SidebarIdentityGroup({
  profileHref,
}: SidebarIdentityGroupProps) {
  const pathname = usePathname();
  const profileDisplayHref = profileHref
    ? formatPublicProfileDisplayHref(profileHref)
    : undefined;
  const isPublicProfileActive = isPublicProfilePath(pathname, profileHref);

  return (
    <fieldset
      aria-label={SIDEBAR_IDENTITY_GROUP_LABEL}
      data-sidebar='user-panel'
      data-testid={SIDEBAR_USER_PANEL_TEST_ID}
      data-identity-group=''
      data-active={isPublicProfileActive ? 'true' : undefined}
      className={cn(
        'group/identity-group m-0 min-w-0 border-0 border-t border-(--noir-ion-border-subtle) px-2.5 py-1.5',
        'group-data-[collapsible=icon]:px-0'
      )}
    >
      <div
        data-sidebar='identity-group'
        data-testid={SIDEBAR_IDENTITY_GROUP_TEST_ID}
        className={cn(
          'relative flex flex-col rounded-xl px-0.5 py-0.5',
          'transition-[background-color,box-shadow] duration-fast ease-interactive',
          'hover:bg-[color-mix(in_oklab,var(--color-sidebar-accent)_82%,transparent)]',
          'has-[:focus-visible]:ring-1 has-[:focus-visible]:ring-ring/35',
          'group-data-[active=true]/identity-group:bg-[color-mix(in_oklab,var(--color-sidebar-accent-active)_88%,var(--app-shell-content-surface))]',
          'group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-0.5',
          // Inner actions stay siblings; the group owns hover / focus-visible /
          // selected / spacing / border chrome so they do not read as two rows.
          '[&_[data-slot=common-dropdown-trigger]]:hover:bg-transparent',
          '[&_[data-slot=common-dropdown-trigger]]:focus-visible:bg-transparent',
          '[&_[data-slot=common-dropdown-trigger]]:focus-visible:ring-0'
        )}
      >
        <UserButton
          profileHref={profileHref}
          settingsHref={APP_ROUTES.SETTINGS}
          showUserInfo
        />
        {profileHref && profileDisplayHref ? (
          <Link
            href={profileHref}
            aria-current={isPublicProfileActive ? 'page' : undefined}
            aria-label={publicProfileAccessibleName(profileDisplayHref)}
            className={cn(
              'relative flex min-h-8 min-w-0 items-center gap-2 rounded-lg py-0.5 pl-10 pr-2 text-left outline-none',
              'text-2xs font-normal text-sidebar-muted',
              'focus-visible:bg-sidebar-accent',
              'after:absolute after:-inset-y-1 after:inset-x-0 after:lg:hidden',
              'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-7 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:pl-0 group-data-[collapsible=icon]:pr-0 group-data-[collapsible=icon]:after:-inset-2'
            )}
          >
            <span className='min-w-0 flex-1 truncate group-data-[collapsible=icon]:hidden'>
              {profileDisplayHref}
            </span>
            <ExternalLink
              aria-hidden='true'
              className='size-3 shrink-0 text-sidebar-item-icon'
            />
          </Link>
        ) : null}
      </div>
    </fieldset>
  );
}
