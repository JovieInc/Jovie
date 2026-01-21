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
  isLoading: boolean;
  copySuccess: boolean;
  onRefreshIngest?: () => void;
  onToggleVerification: () => void;
  onToggleFeatured: () => void;
  onToggleMarketing: () => void;
  onSendInvite?: () => void;
  onDelete: () => void;
  handleCopyClaimLink: () => void;
  includeSeparatorBeforeClaim?: boolean;
}

function RefreshIngestItem({
  onRefreshIngest,
  isLoading,
}: {
  onRefreshIngest?: () => void;
  isLoading: boolean;
}) {
  if (!onRefreshIngest) return null;
  return (
    <>
      <DropdownMenuItem onClick={onRefreshIngest} disabled={isLoading}>
        <RefreshCw className='h-4 w-4' />
        Refresh ingest
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  );
}

function VerificationItem({
  isVerified,
  onClick,
}: {
  isVerified: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {isVerified ? <X className='h-4 w-4' /> : <Check className='h-4 w-4' />}
      {isVerified ? 'Unverify creator' : 'Verify creator'}
    </DropdownMenuItem>
  );
}

function FeaturedItem({
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

function MarketingItem({
  marketingOptOut,
  onClick,
}: {
  marketingOptOut: boolean;
  onClick: () => void;
}) {
  return (
    <DropdownMenuItem onClick={onClick}>
      {marketingOptOut ? (
        <Mail className='h-4 w-4' />
      ) : (
        <MailX className='h-4 w-4' />
      )}
      {marketingOptOut ? 'Enable marketing emails' : 'Disable marketing emails'}
    </DropdownMenuItem>
  );
}

function ViewProfileItem({ username }: { username: string }) {
  return (
    <DropdownMenuItem asChild>
      <Link
        href={`/${username}`}
        target='_blank'
        rel='noopener noreferrer'
        onClick={e => e.stopPropagation()}
      >
        <ExternalLink className='h-4 w-4' />
        View profile
      </Link>
    </DropdownMenuItem>
  );
}

function ClaimItems({
  profile,
  copySuccess,
  handleCopyClaimLink,
  onSendInvite,
  includeSeparator,
}: {
  profile: MenuItemsProps['profile'];
  copySuccess: boolean;
  handleCopyClaimLink: () => void;
  onSendInvite?: () => void;
  includeSeparator?: boolean;
}) {
  if (profile.isClaimed || !profile.claimToken) return null;
  return (
    <>
      {includeSeparator && <DropdownMenuSeparator />}
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
  );
}

function DeleteItem({
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

function MenuItems({
  profile,
  isLoading,
  copySuccess,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onSendInvite,
  onDelete,
  handleCopyClaimLink,
  includeSeparatorBeforeClaim,
}: MenuItemsProps) {
  return (
    <>
      <RefreshIngestItem
        onRefreshIngest={onRefreshIngest}
        isLoading={isLoading}
      />
      <VerificationItem
        isVerified={profile.isVerified}
        onClick={onToggleVerification}
      />
      <FeaturedItem
        isFeatured={profile.isFeatured}
        onClick={onToggleFeatured}
      />
      {!includeSeparatorBeforeClaim && <DropdownMenuSeparator />}
      <MarketingItem
        marketingOptOut={profile.marketingOptOut}
        onClick={onToggleMarketing}
      />
      {includeSeparatorBeforeClaim && <DropdownMenuSeparator />}
      <ViewProfileItem username={profile.username} />
      <ClaimItems
        profile={profile}
        copySuccess={copySuccess}
        handleCopyClaimLink={handleCopyClaimLink}
        onSendInvite={onSendInvite}
        includeSeparator={includeSeparatorBeforeClaim}
      />
      <DropdownMenuSeparator />
      <DeleteItem isClaimed={profile.isClaimed} onClick={onDelete} />
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

  const handleCopyClaimLink = useCallback(async () => {
    if (!profile.claimToken) return;
    const success = await copyTextToClipboard(
      `${getBaseUrl()}/claim/${profile.claimToken}`
    );
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  }, [profile.claimToken]);

  const menuItemsProps: MenuItemsProps = {
    profile,
    isLoading,
    copySuccess,
    onRefreshIngest,
    onToggleVerification,
    onToggleFeatured,
    onToggleMarketing,
    onSendInvite,
    onDelete,
    handleCopyClaimLink,
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
              aria-label='Creator actions menu'
              className='h-8 w-8 rounded-full border border-subtle bg-transparent text-tertiary-token transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-primary-token focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-1'
              disabled={isLoading}
            >
              <MoreVertical className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' sideOffset={8}>
            <MenuItems
              {...menuItemsProps}
              includeSeparatorBeforeClaim={false}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  const stateClass = cn(
    'transition duration-200 ease-out transform',
    status === 'success' &&
      'animate-pulse motion-reduce:animate-none scale-[1.02] ring-1 ring-[color:var(--color-accent)]',
    status === 'error' &&
      'animate-bounce motion-reduce:animate-none scale-[0.97] ring-1 ring-[color:var(--color-destructive)]'
  );

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
        <MenuItems {...menuItemsProps} includeSeparatorBeforeClaim={true} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
