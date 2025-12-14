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
  MoreHorizontal,
  MoreVertical,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useState } from 'react';

import type { CreatorActionStatus } from '@/components/admin/useCreatorActions';
import type { AdminCreatorProfileRow } from '@/lib/admin/creator-profiles';
import {
  geistTableMenuContentClass,
  geistTableMenuDestructiveItemClass,
  geistTableMenuItemClass,
  geistTableMenuSeparatorClass,
} from '@/lib/ui/geist-table-menu';
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

  // Desktop: Show first 4 actions inline, rest in overflow menu
  if (!isMobile) {
    return (
      <div className='flex w-full items-center justify-end gap-1'>
        {/* Overflow Menu: Verify/Feature + other actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='h-8 w-8 rounded-full border border-subtle bg-transparent text-tertiary-token transition-colors hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
              disabled={isLoading}
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
              onClick={onToggleVerification}
              className={geistTableMenuItemClass}
            >
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

            <DropdownMenuItem
              onClick={onToggleFeatured}
              className={geistTableMenuItemClass}
            >
              <Star
                className={cn(
                  'h-4 w-4',
                  profile.isFeatured && 'fill-yellow-400 text-yellow-400'
                )}
              />
              {profile.isFeatured ? 'Unfeature' : 'Feature'}
            </DropdownMenuItem>

            <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />

            <DropdownMenuItem
              onClick={onToggleMarketing}
              className={geistTableMenuItemClass}
            >
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

            <DropdownMenuItem asChild className={geistTableMenuItemClass}>
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
              <DropdownMenuItem
                onClick={handleCopyClaimLink}
                className={geistTableMenuItemClass}
              >
                <Copy className='h-4 w-4' />
                {copySuccess ? 'Copied!' : 'Copy claim link'}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />
            <DropdownMenuItem
              onClick={onDelete}
              className={cn(
                geistTableMenuItemClass,
                geistTableMenuDestructiveItemClass
              )}
            >
              <Trash2 className='h-4 w-4' />
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
      <DropdownMenuContent
        align='end'
        sideOffset={8}
        className={cn('w-56', geistTableMenuContentClass)}
      >
        <DropdownMenuItem
          onClick={onToggleVerification}
          className={geistTableMenuItemClass}
        >
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

        <DropdownMenuItem
          onClick={onToggleFeatured}
          className={geistTableMenuItemClass}
        >
          <Star
            className={cn(
              'h-4 w-4',
              profile.isFeatured && 'fill-yellow-400 text-yellow-400'
            )}
          />
          {profile.isFeatured ? 'Unfeature' : 'Feature'}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={onToggleMarketing}
          className={geistTableMenuItemClass}
        >
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

        <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />

        <DropdownMenuItem asChild className={geistTableMenuItemClass}>
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
            <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />
            <DropdownMenuItem
              onClick={handleCopyClaimLink}
              className={geistTableMenuItemClass}
            >
              <Copy className='h-4 w-4' />
              {copySuccess ? 'Copied!' : 'Copy claim link'}
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className={geistTableMenuSeparatorClass} />

        <DropdownMenuItem
          onClick={onDelete}
          className={cn(
            geistTableMenuItemClass,
            geistTableMenuDestructiveItemClass
          )}
        >
          <Trash2 className='h-4 w-4' />
          {profile.isClaimed ? 'Delete user' : 'Delete creator'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
