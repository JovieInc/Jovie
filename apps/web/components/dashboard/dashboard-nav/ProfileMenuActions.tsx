'use client';

import { Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  SidebarMenuAction,
  SidebarMenuActions,
} from '@/components/organisms/Sidebar';
import { track } from '@/lib/analytics';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import { copyToClipboard } from './utils';

interface ProfileMenuActionsProps {
  publicProfileHref: string;
}

export function ProfileMenuActions({
  publicProfileHref,
}: ProfileMenuActionsProps) {
  const notifications = useNotifications();

  async function handleCopyProfileUrl() {
    const url = `${getBaseUrl()}${publicProfileHref}`;
    const success = await copyToClipboard(url);
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
        <Link
          href={publicProfileHref}
          target='_blank'
          rel='noopener noreferrer'
          aria-label='Open public profile in a new tab'
        >
          <ExternalLink aria-hidden='true' className='size-4' />
        </Link>
      </SidebarMenuAction>
    </SidebarMenuActions>
  );
}
