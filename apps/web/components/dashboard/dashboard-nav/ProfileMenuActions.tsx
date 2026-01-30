'use client';

import { Copy, ExternalLink } from 'lucide-react';
import {
  SidebarMenuAction,
  SidebarMenuActions,
} from '@/components/organisms/Sidebar';
import { PROFILE_URL } from '@/constants/domains';
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
  const profileUrl = `${PROFILE_URL}${publicProfileHref}`;

  async function handleCopyProfileUrl() {
    const success = await copyToClipboard(profileUrl);
    const status = success ? 'success' : 'error';

    if (success) {
      notifications.success('Copied to clipboard');
    } else {
      notifications.error('Failed to copy');
    }

    track('profile_copy_url_click', { status, source: 'dashboard_nav' });
  }

  return (
    <SidebarMenuActions showOnHover>
      <SidebarMenuAction
        type='button'
        aria-label='Copy public profile link'
        onClick={handleCopyProfileUrl}
      >
        <Copy aria-hidden='true' className='size-4' />
      </SidebarMenuAction>
      <SidebarMenuAction asChild>
        <a
          href={profileUrl}
          target='_blank'
          rel='noopener noreferrer'
          aria-label='Open public profile in a new tab'
        >
          <ExternalLink aria-hidden='true' className='size-4' />
        </a>
      </SidebarMenuAction>
    </SidebarMenuActions>
  );
}
