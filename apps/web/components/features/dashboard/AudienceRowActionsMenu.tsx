'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Copy, MoreHorizontal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { AppIconButton } from '@/components/atoms/AppIconButton';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useNotifications } from '@/lib/hooks/useNotifications';
import type { AudienceMember } from '@/types';

interface AudienceRowActionsMenuProps {
  readonly row: AudienceMember;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function AudienceRowActionsMenu({
  row,
  open,
  onOpenChange,
}: AudienceRowActionsMenuProps) {
  const notifications = useNotifications();
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyEmail = useCallback(async () => {
    if (!row.email) return;
    const success = await copyToClipboard(row.email);
    if (success) {
      setCopySuccess(true);
      notifications.success('Copied email');
      setTimeout(() => setCopySuccess(false), 1500);
      return;
    }
    notifications.error('Failed to copy email');
  }, [notifications, row.email]);

  const handleCopyPhone = useCallback(async () => {
    if (!row.phone) return;
    const success = await copyToClipboard(row.phone);
    if (success) {
      setCopySuccess(true);
      notifications.success('Copied phone number');
      setTimeout(() => setCopySuccess(false), 1500);
      return;
    }
    notifications.error('Failed to copy phone number');
  }, [notifications, row.phone]);

  const hasEmail = typeof row.email === 'string' && row.email.length > 0;
  const hasPhone = typeof row.phone === 'string' && row.phone.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <AppIconButton
          ariaLabel='Open audience row actions'
          className='h-8 w-8 rounded-full bg-transparent text-quaternary-token hover:bg-surface-1 hover:text-secondary-token focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-3.5 [&_svg]:w-3.5'
        >
          <MoreHorizontal className='h-4 w-4' />
        </AppIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={8}>
        <DropdownMenuItem disabled={!hasEmail} onClick={handleCopyEmail}>
          <Copy className='h-4 w-4' />
          {copySuccess ? 'Copied!' : 'Copy email'}
        </DropdownMenuItem>

        <DropdownMenuItem disabled={!hasPhone} onClick={handleCopyPhone}>
          <Copy className='h-4 w-4' />
          Copy phone
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem disabled>Copy ID (coming soon)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
