'use client';

import { CommonDropdown } from '@jovie/ui';
import { Copy, ExternalLink, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
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

  async function handleCopyProfileUrl() {
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
  }

  return (
    <SidebarMenuActions showOnHover>
      <SidebarMenuAction asChild>
        <CommonDropdown
          variant='dropdown'
          align='start'
          side='bottom'
          items={[
            {
              type: 'action',
              id: 'copy',
              label: 'Copy Link',
              icon: Copy,
              onClick: handleCopyProfileUrl,
            },
            {
              type: 'action',
              id: 'open',
              label: 'Open Profile',
              icon: ExternalLink,
              onClick: () => window.open(profileUrl, '_blank'),
            },
            { type: 'separator', id: 'sep' },
            {
              type: 'action',
              id: 'settings',
              label: 'Settings',
              icon: Settings,
              onClick: () => router.push(APP_ROUTES.SETTINGS),
            },
          ]}
        />
      </SidebarMenuAction>
    </SidebarMenuActions>
  );
}
