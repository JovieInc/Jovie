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
import { AppIconButton } from '@/components/atoms/AppIconButton';
import { cn } from '@/lib/utils';
import type { CreatorActionsMenuProps } from './types';

interface MenuItemsProps {
  readonly profile: CreatorActionsMenuProps['profile'];
  readonly isLoading: boolean;
  readonly onRefreshIngest?: () => void;
  readonly onToggleVerification: () => void;
  readonly onToggleFeatured: () => void;
  readonly onToggleMarketing: () => void;
  readonly onSendInvite?: () => void;
  readonly onDelete: () => void;
}

/**
 * Shared menu items for both desktop and mobile views
 */
function MenuItems({
  profile,
  isLoading,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onSendInvite,
  onDelete,
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

      {!profile.isClaimed && profile.claimToken && onSendInvite && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onSendInvite}>
            <Send className='h-3.5 w-3.5' />
            Send invite
          </DropdownMenuItem>
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
  const isLoading = status === 'loading' || refreshIngestStatus === 'loading';
  const isSuccess = status === 'success';
  const isError = status === 'error';

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
            <AppIconButton
              ariaLabel='Open creator actions'
              className='h-8 w-8 rounded-[8px] bg-transparent text-quaternary-token hover:bg-surface-1 hover:text-secondary-token focus-visible:ring-1 focus-visible:ring-(--linear-border-focus)/25 [&_svg]:h-3.5 [&_svg]:w-3.5'
              disabled={isLoading}
            >
              <MoreVertical className='h-3.5 w-3.5' />
            </AppIconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' sideOffset={8}>
            <MenuItems
              profile={profile}
              isLoading={isLoading}
              onRefreshIngest={onRefreshIngest}
              onToggleVerification={onToggleVerification}
              onToggleFeatured={onToggleFeatured}
              onToggleMarketing={onToggleMarketing}
              onSendInvite={onSendInvite}
              onDelete={onDelete}
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
          isLoading={isLoading}
          onRefreshIngest={onRefreshIngest}
          onToggleVerification={onToggleVerification}
          onToggleFeatured={onToggleFeatured}
          onToggleMarketing={onToggleMarketing}
          onSendInvite={onSendInvite}
          onDelete={onDelete}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
