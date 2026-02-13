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

import { copyToClipboard } from '@/hooks/useClipboard';
import type { AdminUserRow } from '@/lib/admin/users';

interface UserActionsMenuProps {
  readonly user: AdminUserRow;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

export function UserActionsMenu({
  user,
  open,
  onOpenChange,
}: Readonly<UserActionsMenuProps>) {
  const [copySuccess, setCopySuccess] = useState(false);

  const handleCopyClerkId = useCallback(async () => {
    const success = await copyToClipboard(user.clerkId);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
    }
  }, [user.clerkId]);

  const handleCopyEmail = useCallback(async () => {
    if (!user.email) return;
    const success = await copyToClipboard(user.email);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 1500);
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
          <MoreVertical className='h-3.5 w-3.5' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={8}>
        <DropdownMenuItem onClick={handleCopyClerkId}>
          <Copy className='h-3.5 w-3.5' />
          {copySuccess ? 'Copied!' : 'Copy Clerk user ID'}
        </DropdownMenuItem>

        <DropdownMenuItem disabled={!user.email} onClick={handleCopyEmail}>
          <Copy className='h-3.5 w-3.5' />
          Copy email
        </DropdownMenuItem>

        {clerkConsoleUrl ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a
                href={clerkConsoleUrl}
                target='_blank'
                rel='noopener noreferrer'
              >
                <ExternalLink className='h-3.5 w-3.5' />
                Open in Clerk
              </a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
