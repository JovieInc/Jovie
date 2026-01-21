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
}: CreatorActionsMenuProps) {
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
              className='h-8 w-8 rounded-md border border-subtle bg-transparent text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
              disabled={isLoading}
            >
              <MoreVertical className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' sideOffset={8}>
            {onRefreshIngest ? (
              <>
                <DropdownMenuItem
                  onClick={onRefreshIngest}
                  disabled={isLoading}
                >
                  <RefreshCw className='h-4 w-4' />
                  Refresh ingest
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem onClick={onToggleVerification}>
              {profile.isVerified ? (
                <>
                  <X className='h-4 w-4' />
                  Unverify creator
                </>
              ) : (
                <>
                  <Check className='h-4 w-4' />
                  Verify creator
                </>
              )}
            </DropdownMenuItem>

            <DropdownMenuItem onClick={onToggleFeatured}>
              <Star
                className={cn(
                  'h-4 w-4',
                  profile.isFeatured && 'fill-yellow-400 text-yellow-400'
                )}
              />
              {profile.isFeatured ? 'Unfeature' : 'Feature'}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={onToggleMarketing}>
              {profile.marketingOptOut ? (
                <>
                  <Mail className='h-4 w-4' />
                  Enable marketing emails
                </>
              ) : (
                <>
                  <MailX className='h-4 w-4' />
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
                <ExternalLink className='h-4 w-4' />
                View profile
              </Link>
            </DropdownMenuItem>

            {!profile.isClaimed && profile.claimToken && (
              <>
                <DropdownMenuItem onClick={handleCopyClaimLink}>
                  <Copy className='h-4 w-4' />
                  {copySuccess ? 'Copied!' : 'Copy claim link'}
                </DropdownMenuItem>
                {onSendInvite && (
                  <DropdownMenuItem onClick={onSendInvite}>
                    <Send className='h-4 w-4' />
                    Send invite
                  </DropdownMenuItem>
                )}
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onDelete}
              className='text-destructive hover:text-destructive hover:bg-destructive/10 data-highlighted:text-destructive data-highlighted:bg-destructive/10 [&_svg]:text-destructive'
            >
              <Trash2 className='h-4 w-4' />
              {profile.isClaimed ? 'Delete user' : 'Delete creator'}
            </DropdownMenuItem>
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
          <MoreVertical className='h-4 w-4 ml-1' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' sideOffset={8} className='w-56'>
        {onRefreshIngest ? (
          <>
            <DropdownMenuItem onClick={onRefreshIngest} disabled={isLoading}>
              <RefreshCw className='h-4 w-4' />
              Refresh ingest
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onClick={onToggleVerification}>
          {profile.isVerified ? (
            <>
              <X className='h-4 w-4' />
              Unverify creator
            </>
          ) : (
            <>
              <Check className='h-4 w-4' />
              Verify creator
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleFeatured}>
          <Star
            className={cn(
              'h-4 w-4',
              profile.isFeatured && 'fill-yellow-400 text-yellow-400'
            )}
          />
          {profile.isFeatured ? 'Unfeature' : 'Feature'}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleMarketing}>
          {profile.marketingOptOut ? (
            <>
              <Mail className='h-4 w-4' />
              Enable marketing emails
            </>
          ) : (
            <>
              <MailX className='h-4 w-4' />
              Disable marketing emails
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href={`/${profile.username}`}
            target='_blank'
            rel='noopener noreferrer'
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className='h-4 w-4' />
            View profile
          </Link>
        </DropdownMenuItem>

        {!profile.isClaimed && profile.claimToken && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCopyClaimLink}>
              <Copy className='h-4 w-4' />
              {copySuccess ? 'Copied!' : 'Copy claim link'}
            </DropdownMenuItem>
            {onSendInvite && (
              <DropdownMenuItem onClick={onSendInvite}>
                <Send className='h-4 w-4' />
                Send invite
              </DropdownMenuItem>
            )}
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onDelete}
          className='text-destructive hover:text-destructive hover:bg-destructive/10 data-highlighted:text-destructive data-highlighted:bg-destructive/10 [&_svg]:text-destructive'
        >
          <Trash2 className='h-4 w-4' />
          {profile.isClaimed ? 'Delete user' : 'Delete creator'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
