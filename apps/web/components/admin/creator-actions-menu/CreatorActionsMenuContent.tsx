'use client';

import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  MailX,
  RefreshCw,
  Send,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CreatorActionsMenuProps } from './types';

interface MenuItemProps {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}

interface CreatorActionsMenuContentProps
  extends Pick<
    CreatorActionsMenuProps,
    | 'profile'
    | 'status'
    | 'refreshIngestStatus'
    | 'onToggleVerification'
    | 'onToggleFeatured'
    | 'onToggleMarketing'
    | 'onRefreshIngest'
    | 'onSendInvite'
    | 'onDelete'
  > {
  copySuccess: boolean;
  onCopyClaimLink: () => Promise<void>;
  renderItem: (props: MenuItemProps) => React.ReactNode;
  renderSeparator: () => React.ReactNode;
}

export function CreatorActionsMenuContent({
  profile,
  status,
  refreshIngestStatus,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onRefreshIngest,
  onSendInvite,
  onDelete,
  copySuccess,
  onCopyClaimLink,
  renderItem,
  renderSeparator,
}: Readonly<CreatorActionsMenuContentProps>) {
  const isLoading = status === 'loading' || refreshIngestStatus === 'loading';

  return (
    <>
      {onRefreshIngest ? (
        <>
          {renderItem({
            onClick: () => void onRefreshIngest?.(),
            disabled: isLoading,
            children: (
              <>
                <RefreshCw className='h-3.5 w-3.5' />
                Refresh ingest
              </>
            ),
          })}
          {renderSeparator()}
        </>
      ) : null}
      {renderItem({
        onClick: () => void onToggleVerification?.(),
        children: profile.isVerified ? (
          <>
            <X className='h-3.5 w-3.5' />
            Unverify creator
          </>
        ) : (
          <>
            <Check className='h-3.5 w-3.5' />
            Verify creator
          </>
        ),
      })}

      {renderItem({
        onClick: () => void onToggleFeatured?.(),
        children: (
          <>
            <Star
              className={cn(
                'h-3.5 w-3.5',
                profile.isFeatured && 'fill-yellow-400 text-yellow-400'
              )}
            />
            {profile.isFeatured ? 'Unfeature' : 'Feature'}
          </>
        ),
      })}

      {renderSeparator()}

      {renderItem({
        onClick: () => void onToggleMarketing?.(),
        children: profile.marketingOptOut ? (
          <>
            <Mail className='h-3.5 w-3.5' />
            Enable marketing emails
          </>
        ) : (
          <>
            <MailX className='h-3.5 w-3.5' />
            Disable marketing emails
          </>
        ),
      })}

      {renderItem({
        href: `/${profile.username}`,
        children: (
          <>
            <ExternalLink className='h-3.5 w-3.5' />
            View profile
          </>
        ),
      })}

      {!profile.isClaimed && profile.claimToken && (
        <>
          {renderItem({
            onClick: () => void onCopyClaimLink(),
            children: (
              <>
                <Copy className='h-3.5 w-3.5' />
                {copySuccess ? 'Copied!' : 'Copy claim link'}
              </>
            ),
          })}
          {onSendInvite &&
            renderItem({
              onClick: onSendInvite,
              children: (
                <>
                  <Send className='h-3.5 w-3.5' />
                  Send invite
                </>
              ),
            })}
        </>
      )}

      {renderSeparator()}
      {renderItem({
        onClick: onDelete,
        destructive: true,
        children: (
          <>
            <Trash2 className='h-3.5 w-3.5' />
            {profile.isClaimed ? 'Delete user' : 'Delete creator'}
          </>
        ),
      })}
    </>
  );
}
