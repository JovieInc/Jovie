'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Copy, MoreHorizontal } from 'lucide-react';
import { useCallback, useState } from 'react';

import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  geistTableMenuContentClass,
  geistTableMenuItemClass,
  geistTableMenuSeparatorClass,
} from '@/lib/ui/geist-table-menu';
import type { AudienceMember } from '@/types';

interface AudienceRowActionsMenuProps {
  row: AudienceMember;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
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
    const success = await copyTextToClipboard(row.email);
    if (success) {
      setCopySuccess(true);
      notifications.success('Copied email');
      window.setTimeout(() => setCopySuccess(false), 1500);
      return;
    }
    notifications.error('Failed to copy email');
  }, [notifications, row.email]);

  const handleCopyPhone = useCallback(async () => {
    if (!row.phone) return;
    const success = await copyTextToClipboard(row.phone);
    if (success) {
      setCopySuccess(true);
      notifications.success('Copied phone number');
      window.setTimeout(() => setCopySuccess(false), 1500);
      return;
    }
    notifications.error('Failed to copy phone number');
  }, [notifications, row.phone]);

  const hasEmail = typeof row.email === 'string' && row.email.length > 0;
  const hasPhone = typeof row.phone === 'string' && row.phone.length > 0;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='h-8 w-8 rounded-full border border-subtle bg-transparent text-tertiary-token transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
        >
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        className={geistTableMenuContentClass}
      >
        <DropdownMenuItem
          disabled={!hasEmail}
          onClick={handleCopyEmail}
          className={geistTableMenuItemClass}
        >
          <Copy className='h-4 w-4' />
          {copySuccess ? 'Copied!' : 'Copy email'}
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!hasPhone}
          onClick={handleCopyPhone}
          className={geistTableMenuItemClass}
        >
          <Copy className='h-4 w-4' />
          Copy phone
        </DropdownMenuItem>

        <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />

        <DropdownMenuItem disabled className={geistTableMenuItemClass}>
          Copy ID (coming soon)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
