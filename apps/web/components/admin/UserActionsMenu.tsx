'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Copy, ExternalLink, MoreVertical } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AppIconButton } from '@/components/atoms/AppIconButton';
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
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopyClerkId = useCallback(async () => {
    const success = await copyToClipboard(user.clerkId);
    if (success) {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      setCopySuccess(true);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 1500);
    }
  }, [user.clerkId]);

  const handleCopyEmail = useCallback(async () => {
    if (!user.email) return;
    const success = await copyToClipboard(user.email);
    if (success) {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      setCopySuccess(true);
      copyTimeoutRef.current = setTimeout(() => setCopySuccess(false), 1500);
    }
  }, [user.email]);

  const hasClerkConsoleUrl = user.clerkId.length > 0;
  const clerkConsoleUrl = hasClerkConsoleUrl
    ? `https://dashboard.clerk.com/apps/users/user_${encodeURIComponent(user.clerkId)}`
    : null;

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <AppIconButton
          ariaLabel='Open user actions'
          className='h-8 w-8 rounded-[8px] bg-transparent text-(--linear-text-quaternary) hover:bg-(--linear-bg-surface-1) hover:text-(--linear-text-secondary) focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-3.5 [&_svg]:w-3.5'
        >
          <MoreVertical className='h-3.5 w-3.5' />
        </AppIconButton>
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
