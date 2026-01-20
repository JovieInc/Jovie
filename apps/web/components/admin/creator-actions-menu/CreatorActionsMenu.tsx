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

/** Menu item for verification toggle */
function VerificationMenuItem({
  isVerified,
  onClick,
}: {
  isVerified: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {isVerified ? (
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
  );
}

/** Menu item for featured toggle */
function FeaturedMenuItem({
  isFeatured,
  onClick,
}: {
  isFeatured: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      <Star
        className={cn(
          'h-4 w-4',
          isFeatured && 'fill-yellow-400 text-yellow-400'
        )}
      />
      {isFeatured ? 'Unfeature' : 'Feature'}
    </DropdownMenuItem>
  );
}

/** Menu item for marketing toggle */
function MarketingMenuItem({
  marketingOptOut,
  onClick,
}: {
  marketingOptOut: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {marketingOptOut ? (
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
  );
}

/** Menu item for delete action */
function DeleteMenuItem({
  isClaimed,
  onClick,
}: {
  isClaimed: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem
      onClick={onClick}
      className='text-destructive hover:text-destructive hover:bg-destructive/10 data-highlighted:text-destructive data-highlighted:bg-destructive/10 [&_svg]:text-destructive'
    >
      <Trash2 className='h-4 w-4' />
      {isClaimed ? 'Delete user' : 'Delete creator'}
    </DropdownMenuItem>
  );
}

/** Props for dropdown menu content */
interface MenuContentProps {
  profile: CreatorActionsMenuProps['profile'];
  isLoading: boolean;
  copySuccess: boolean;
  onRefreshIngest?: () => void;
  onToggleVerification: () => void;
  onToggleFeatured: () => void;
  onToggleMarketing: () => void;
  onSendInvite?: () => void;
  onDelete: () => void;
  onCopyClaimLink: () => void;
  includeSeparatorBeforeClaim?: boolean;
}

/** Shared menu content for both mobile and desktop */
function MenuContent({
  profile,
  isLoading,
  copySuccess,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onSendInvite,
  onDelete,
  onCopyClaimLink,
  includeSeparatorBeforeClaim = false,
}: MenuContentProps) {
  return (
    <>
      {onRefreshIngest && (
        <>
          <DropdownMenuItem onClick={onRefreshIngest} disabled={isLoading}>
            <RefreshCw className='h-4 w-4' />
            Refresh ingest
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}

      <VerificationMenuItem
        isVerified={profile.isVerified}
        onClick={onToggleVerification}
      />

      <FeaturedMenuItem
        isFeatured={profile.isFeatured}
        onClick={onToggleFeatured}
      />

      <DropdownMenuSeparator />

      <MarketingMenuItem
        marketingOptOut={profile.marketingOptOut}
        onClick={onToggleMarketing}
      />

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
          {includeSeparatorBeforeClaim && <DropdownMenuSeparator />}
          <DropdownMenuItem onClick={onCopyClaimLink}>
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
      <DeleteMenuItem isClaimed={profile.isClaimed} onClick={onDelete} />
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

  const menuContentProps: MenuContentProps = {
    profile,
    isLoading,
    copySuccess,
    onRefreshIngest,
    onToggleVerification,
    onToggleFeatured,
    onToggleMarketing,
    onSendInvite,
    onDelete,
    onCopyClaimLink: handleCopyClaimLink,
  };

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
            <MenuContent {...menuContentProps} />
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
        <MenuContent {...menuContentProps} includeSeparatorBeforeClaim />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
