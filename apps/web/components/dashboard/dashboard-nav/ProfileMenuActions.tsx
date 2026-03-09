'use client';

import { CommonDropdown } from '@jovie/ui';
import { Copy, ExternalLink, ImageDown, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import {
  SidebarMenuAction,
  SidebarMenuActions,
} from '@/components/organisms/Sidebar';
import { BASE_URL } from '@/constants/domains';
import { APP_ROUTES } from '@/constants/routes';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { copyToClipboard } from './utils';

interface ProfileMenuActionsProps {
  readonly publicProfileHref: string;
}

export function ProfileMenuActions({
  publicProfileHref,
}: ProfileMenuActionsProps) {
  const notifications = useNotifications();
  const router = useRouter();
  const profileUrl = `${BASE_URL}${publicProfileHref}`;

  const handleCopyProfileUrl = useCallback(async () => {
    const success = await copyToClipboard(profileUrl);

    if (success) {
      notifications.success('Copied to clipboard');
    } else {
      notifications.error('Failed to copy');
    }

    track('profile_copy_url_click', {
      status: success ? 'success' : 'error',
      source: 'dashboard_nav',
    });
  }, [profileUrl, notifications]);

  const items = useMemo(
    () => [
      {
        type: 'action' as const,
        id: 'copy',
        label: 'Copy Link',
        icon: Copy,
        onClick: () => {
          handleCopyProfileUrl();
        },
      },
      {
        type: 'action' as const,
        id: 'open',
        label: 'Open Profile',
        icon: ExternalLink,
        onClick: () => window.open(profileUrl, '_blank'),
      },
      {
        type: 'action' as const,
        id: 'retargeting-ads',
        label: 'Download Ads',
        icon: ImageDown,
        onClick: () => router.push(APP_ROUTES.SETTINGS_RETARGETING_ADS),
      },
      { type: 'separator' as const, id: 'sep' },
      {
        type: 'action' as const,
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        onClick: () => router.push(APP_ROUTES.SETTINGS),
      },
    ],
    [handleCopyProfileUrl, profileUrl, router]
  );

  return (
    <SidebarMenuActions showOnHover>
      <SidebarMenuAction asChild>
        <CommonDropdown
          variant='dropdown'
          size='compact'
          align='start'
          side='bottom'
          items={items}
        />
      </SidebarMenuAction>
    </SidebarMenuActions>
  );
}
