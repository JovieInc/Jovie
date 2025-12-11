'use client';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@jovie/ui';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  MailX,
  MoreHorizontal,
  MoreVertical,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import type { CreatorActionStatus } from '@/components/admin/useCreatorActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import { cn } from '@/lib/utils';
import { getBaseUrl } from '@/lib/utils/platform-detection';

interface CreatorActionsMenuProps {
  profile: AdminCreatorProfileRow;
  isMobile: boolean;
  status: CreatorActionStatus;
  onToggleVerification: () => Promise<void>;
  onToggleFeatured: () => Promise<void>;
  onToggleMarketing: () => Promise<void>;
  onDelete: () => void;
  onRefresh?: () => Promise<void>;
  refreshing?: boolean;
}

const copyTextToClipboard = async (text: string): Promise<boolean> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('Clipboard API copy failed', error);
    }
  }
  return false;
};

export function CreatorActionsMenu({
  profile,
  isMobile,
  status,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onDelete,
  onRefresh,
  refreshing,
}: CreatorActionsMenuProps) {
  const [copySuccess, setCopySuccess] = useState(false);

  const isLoading = status === 'loading';
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
    'transition duration-200 ease-in-out transform',
    isSuccess &&
      'animate-pulse scale-[1.02] ring-1 ring-[color:var(--color-accent)]',
    isError &&
      'animate-bounce scale-[0.97] ring-1 ring-[color:var(--color-destructive)]'
  );

  const menuItemClass =
    'h-8 text-[13px] leading-5 text-sidebar-foreground/80 data-highlighted:bg-sidebar-accent data-highlighted:text-sidebar-accent-foreground';

  // Desktop: Show first 4 actions inline, rest in overflow menu
  if (!isMobile) {
    return (
      <div className='flex w-full items-center justify-end gap-1'>
        {/* Inline Action 1: Verify/Unverify */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className={cn(
                'h-8 w-8 text-secondary-token hover:text-primary-token',
                stateClass
              )}
              onClick={onToggleVerification}
              disabled={isLoading}
            >
              {profile.isVerified ? (
                <X className='h-4 w-4' />
              ) : (
                <Check className='h-4 w-4' />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>
            {profile.isVerified ? 'Unverify creator' : 'Verify creator'}
          </TooltipContent>
        </Tooltip>

        {/* Inline Action 2: Featured */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className={cn(
                'h-8 w-8 text-secondary-token hover:text-primary-token',
                stateClass
              )}
              onClick={onToggleFeatured}
              disabled={isLoading}
            >
              <Star
                className={cn(
                  'h-4 w-4',
                  profile.isFeatured && 'fill-yellow-400 text-yellow-400'
                )}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent side='top'>Toggle featured status</TooltipContent>
        </Tooltip>

        {/* Overflow Menu: Marketing toggle, View profile, Copy Claim Link, Delete */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='h-8 w-8 text-secondary-token hover:text-primary-token'
              disabled={isLoading}
            >
              <MoreHorizontal className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align='end'
            sideOffset={8}
            className='rounded-lg bg-white text-[#111] border border-[#e5e5e5] dark:bg-[#111] dark:text-[#eaeaea] dark:border-[#1f1f1f]'
          >
            <DropdownMenuItem
              className={menuItemClass}
              onClick={onToggleMarketing}
            >
              {profile.marketingOptOut ? (
                <>
                  <Mail className='h-4 w-4 mr-2' />
                  Enable marketing emails
                </>
              ) : (
                <>
                  <MailX className='h-4 w-4 mr-2' />
                  Disable marketing emails
                </>
              )}
            </DropdownMenuItem>

            {onRefresh && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className={menuItemClass}
                  onClick={async () => {
                    if (refreshing) return;
                    await onRefresh();
                  }}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <div className='flex items-center gap-2'>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      Refreshing…
                    </div>
                  ) : (
                    <div className='flex items-center gap-2'>
                      <RefreshCw className='h-4 w-4' />
                      <span>Refresh ingest</span>
                    </div>
                  )}
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link
                href={`/${profile.username}`}
                target='_blank'
                rel='noopener noreferrer'
                onClick={e => e.stopPropagation()}
                className={menuItemClass}
              >
                <ExternalLink className='h-4 w-4 mr-2' />
                View profile
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {!profile.isClaimed && profile.claimToken && (
              <DropdownMenuItem
                className={menuItemClass}
                onClick={handleCopyClaimLink}
              >
                <Copy className='h-4 w-4 mr-2' />
                {copySuccess ? 'Copied!' : 'Copy claim link'}
              </DropdownMenuItem>
            )}
            {!profile.isClaimed && profile.claimToken && (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuItem
              className='h-8 text-[13px] leading-5 bg-[#e5484d] text-white data-highlighted:bg-[#c52c31] data-highlighted:text-white focus:text-white dark:bg-[#d72631] dark:data-highlighted:bg-[#b81f28]'
              onClick={onDelete}
            >
              <Trash2 className='h-4 w-4 mr-2' />
              {profile.isClaimed ? 'Delete user' : 'Delete creator'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Mobile: All actions in dropdown
  return (
    <DropdownMenu>
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
      <DropdownMenuContent align='end' sideOffset={8} className='w-48'>
        <DropdownMenuItem onClick={onToggleVerification}>
          {profile.isVerified ? (
            <>
              <X className='h-4 w-4 mr-2' />
              Unverify creator
            </>
          ) : (
            <>
              <Check className='h-4 w-4 mr-2' />
              Verify creator
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleFeatured}>
          <Star
            className={cn(
              'h-4 w-4 mr-2',
              profile.isFeatured && 'fill-yellow-400 text-yellow-400'
            )}
          />
          {profile.isFeatured ? 'Unfeature' : 'Feature'}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onToggleMarketing}>
          {profile.marketingOptOut ? (
            <>
              <Mail className='h-4 w-4 mr-2' />
              Enable marketing emails
            </>
          ) : (
            <>
              <MailX className='h-4 w-4 mr-2' />
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
            <ExternalLink className='h-4 w-4 mr-2' />
            View profile
          </Link>
        </DropdownMenuItem>

        {!profile.isClaimed && profile.claimToken && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCopyClaimLink}>
              <Copy className='h-4 w-4 mr-2' />
              {copySuccess ? 'Copied!' : 'Copy claim link'}
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onDelete}
          className='text-destructive focus:text-destructive'
        >
          <Trash2 className='h-4 w-4 mr-2' />
          {profile.isClaimed ? 'Delete user' : 'Delete creator'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
