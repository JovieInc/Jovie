'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@jovie/ui';
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  MailX,
  MoreVertical,
  RefreshCw,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';
import type { CreatorActionsMenuProps } from './types';
import { copyTextToClipboard } from './utils';

interface MenuItemsProps {
  profile: CreatorActionsMenuProps['profile'];
  copySuccess: boolean;
  isLoading: boolean;
  onRefreshIngest?: () => void;
  onToggleVerification: () => void;
  onToggleFeatured: () => void;
  onToggleMarketing: () => void;
  onSendInvite?: () => void;
  onDelete: () => void;
  handleCopyClaimLink: () => void;
}

/**
 * Shared menu items for both desktop and mobile views
 */
function MenuItems({
  profile,
  copySuccess,
  isLoading,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onSendInvite,
  onDelete,
  handleCopyClaimLink,
}: Readonly<MenuItemsProps>) {
  return (
    <>
      {onRefreshIngest && (
        <>
          <DropdownMenuItem onClick={onRefreshIngest} disabled={isLoading}>
            <RefreshCw className='h-3.5 w-3.5' />
            Refresh ingest
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      <DropdownMenuItem onClick={onToggleVerification}>
        {profile.isVerified ? (
          <>
            <X className='h-3.5 w-3.5' />
            Unverify creator
          </>
        ) : (
          <>
            <Check className='h-3.5 w-3.5' />
            Verify creator
          </>
        )}
      </DropdownMenuItem>

      <DropdownMenuItem onClick={onToggleFeatured}>
        <Star
          className={cn(
            'h-3.5 w-3.5',
            profile.isFeatured && 'fill-yellow-400 text-yellow-400'
          )}
        />
        {profile.isFeatured ? 'Unfeature' : 'Feature'}
      </DropdownMenuItem>

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={onToggleMarketing}>
        {profile.marketingOptOut ? (
          <>
            <Mail className='h-3.5 w-3.5' />
            Enable marketing emails
          </>
        ) : (
          <>
            <MailX className='h-3.5 w-3.5' />
            Disable marketing emails
          </>
        )}
      </DropdownMenuItem>

      <DropdownMenuItem asChild>
        <Link
          href={`/${profile.username}`}
          target='_blank'
          rel='noopener noreferrer'
          onClick={e => e.stopPropagation()}
        >
          <ExternalLink className='h-3.5 w-3.5' />
          View profile
        </Link>
      </DropdownMenuItem>

      {!profile.isClaimed && profile.claimToken && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopyClaimLink}>
            <Copy className='h-3.5 w-3.5' />
            {copySuccess ? 'Copied!' : 'Copy claim link'}
          </DropdownMenuItem>
          {onSendInvite && (
            <DropdownMenuItem onClick={onSendInvite}>
              <Send className='h-3.5 w-3.5' />
              Send invite
            </DropdownMenuItem>
          )}
        </>
      )}

      <DropdownMenuSeparator />

      <DropdownMenuItem onClick={onDelete} variant='destructive'>
        <Trash2 className='h-3.5 w-3.5' />
        {profile.isClaimed ? 'Delete user' : 'Delete creator'}
      </DropdownMenuItem>
    </>
  );
}

export function CreatorActionsMenu({
  profile,
  isMobile,
  status,
  refreshIngestStatus,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onRefreshIngest,
  onSendInvite,
  onDelete,
  open,
  onOpenChange,
}: Readonly<CreatorActionsMenuProps>) {
  const [copySuccess, setCopySuccess] = useState(false);

  const isLoading = status === 'loading' || refreshIngestStatus === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

  const handleCopyClaimLink = useCallback(async () => {
    if (!profile.claimToken) return;

    const baseUrl = getBaseUrl();
    const claimUrl = `${baseUrl}/claim/${profile.claimToken}`;
    const success = await copyTextToClipboard(claimUrl);

    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [profile.claimToken]);

  const stateClass = cn(
    'transition duration-200 ease-out transform',
    isSuccess &&
      'animate-pulse motion-reduce:animate-none scale-[1.02] ring-1 ring-[color:var(--color-accent)]',
    isError &&
      'animate-bounce motion-reduce:animate-none scale-[0.97] ring-1 ring-[color:var(--color-destructive)]'
  );

  if (!isMobile) {
    return (
      <div className='flex w-full items-center justify-end gap-1'>
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='h-8 w-8 rounded-full border border-subtle bg-transparent text-tertiary-token transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
              disabled={isLoading}
            >
              <MoreVertical className='h-3.5 w-3.5' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' sideOffset={8}>
            <MenuItems
              profile={profile}
              copySuccess={copySuccess}
              isLoading={isLoading}
              onRefreshIngest={onRefreshIngest}
              onToggleVerification={onToggleVerification}
              onToggleFeatured={onToggleFeatured}
              onToggleMarketing={onToggleMarketing}
              onSendInvite={onSendInvite}
              onDelete={onDelete}
              handleCopyClaimLink={handleCopyClaimLink}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          className={stateClass}
          disabled={isLoading}
        >
          Actions
          <MoreVertical className='h-3.5 w-3.5 ml-1' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={8} className='w-56'>
        <MenuItems
          profile={profile}
          copySuccess={copySuccess}
          isLoading={isLoading}
          onRefreshIngest={onRefreshIngest}
          onToggleVerification={onToggleVerification}
          onToggleFeatured={onToggleFeatured}
          onToggleMarketing={onToggleMarketing}
          onSendInvite={onSendInvite}
          onDelete={onDelete}
          handleCopyClaimLink={handleCopyClaimLink}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
