'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Copy, ExternalLink, MoreVertical } from 'lucide-react';
import { useCallback, useState } from 'react';

import type { AdminUserRow } from '@/lib/admin/users';
import {
  geistTableMenuContentClass,
  geistTableMenuItemClass,
  geistTableMenuSeparatorClass,
} from '@/lib/ui/geist-table-menu';

interface UserActionsMenuProps {
  user: AdminUserRow;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

export function UserActionsMenu({
  user,
  open,
  onOpenChange,
}: UserActionsMenuProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyClerkId = useCallback(async () => {
    const success = await copyTextToClipboard(user.clerkId);
    if (success) {
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1500);
    }
  }, [user.clerkId]);

  const handleCopyEmail = useCallback(async () => {
    if (!user.email) return;
    const success = await copyTextToClipboard(user.email);
    if (success) {
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1500);
    }
  }, [user.email]);

  const hasClerkConsoleUrl = user.clerkId.length > 0;
  const clerkConsoleUrl = hasClerkConsoleUrl
    ? `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(user.clerkId)}`
    : null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          size='icon'
          variant='ghost'
          className='h-8 w-8 rounded-full border border-subtle bg-transparent text-tertiary-token transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
        >
          <MoreVertical className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        className={geistTableMenuContentClass}
      >
        <DropdownMenuItem
          onClick={handleCopyClerkId}
          className={geistTableMenuItemClass}
        >
          <Copy className='h-4 w-4' />
          {copySuccess ? 'Copied!' : 'Copy Clerk user ID'}
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!user.email}
          onClick={handleCopyEmail}
          className={geistTableMenuItemClass}
        >
          <Copy className='h-4 w-4' />
          Copy email
        </DropdownMenuItem>

        {clerkConsoleUrl ? (
          <>
            <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />
            <DropdownMenuItem asChild className={geistTableMenuItemClass}>
              <a
                href={clerkConsoleUrl}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ExternalLink className='h-4 w-4' />
                Open in Clerk
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
