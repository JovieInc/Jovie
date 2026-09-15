'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@/components/organisms/user-button';
import { Tooltip } from '@/components/shell/Tooltip';
import { HOSTNAME } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';
import './SidebarIdentityGroup.css';

export const SIDEBAR_IDENTITY_GROUP_LABEL = 'Creator Identity';
export const SIDEBAR_IDENTITY_GROUP_TEST_ID = 'sidebar-identity-group';
export const SIDEBAR_USER_PANEL_TEST_ID = 'sidebar-user-panel';

export interface SidebarIdentityGroupProps {
  readonly calm?: boolean;
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
  calm = false,
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
        'm-0 min-w-0 border-0',
        calm ? 'px-3 py-0' : 'px-2.5 py-1.5'
      )}
    >
      <div
        data-sidebar='identity-group'
        data-testid={SIDEBAR_IDENTITY_GROUP_TEST_ID}
        className={cn(
          'relative flex items-center rounded-lg px-0.5 py-0.5',
          calm && 'p-0',
          'transition-colors duration-fast ease-interactive',
          'hover:bg-sidebar-accent',
          isPublicProfileActive && 'bg-sidebar-accent-active',
          // Inner actions stay siblings; the group owns hover / focus-visible /
          // selected / spacing / border chrome so they do not read as two rows.
          '[&_[data-slot=common-dropdown-trigger]]:min-w-0',
          '[&_[data-slot=common-dropdown-trigger]]:flex-1',
          '[&_[data-slot=common-dropdown-trigger]]:hover:bg-transparent',
          '[&_[data-slot=common-dropdown-trigger]]:focus-visible:bg-transparent',
          '[&_[data-slot=common-dropdown-trigger]]:focus-visible:ring-0'
        )}
      >
        <UserButton
          calm={calm}
          profileHref={profileHref}
          settingsHref={APP_ROUTES.SETTINGS}
          showUserInfo
        />
        {!calm && profileHref && profileDisplayHref ? (
          <Tooltip label={profileDisplayHref} side='right'>
            <Link
              href={profileHref}
              data-sidebar='identity-public-profile'
              aria-current={isPublicProfileActive ? 'page' : undefined}
              aria-label={publicProfileAccessibleName(profileDisplayHref)}
              className={cn(
                'relative flex size-8 shrink-0 items-center justify-center rounded-md outline-none',
                'text-2xs font-normal text-sidebar-muted',
                'focus-visible:bg-sidebar-accent',
                'after:absolute after:-inset-y-1 after:inset-x-0 after:lg:hidden'
              )}
            >
              <span data-sidebar='identity-profile-url' className='sr-only'>
                {profileDisplayHref}
              </span>
              <ExternalLink
                aria-hidden='true'
                className='size-3 shrink-0 text-sidebar-item-icon'
              />
            </Link>
          </Tooltip>
        ) : null}
      </div>
    </fieldset>
  );
}
