'use client';

import { Button } from '@jovie/ui';
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
import type { TableActionMenuItem } from '@/components/atoms/table-action-menu';
import { TableActionMenu } from '@/components/atoms/table-action-menu';
import { TableRowOverflowTrigger } from '@/components/organisms/table';
import { cn } from '@/lib/utils';
import type { CreatorActionsMenuProps } from './types';

function buildCreatorActionMenuItems({
  profile,
  isLoading,
  onRefreshIngest,
  onToggleVerification,
  onToggleFeatured,
  onToggleMarketing,
  onSendInvite,
  onDelete,
}: Readonly<{
  profile: CreatorActionsMenuProps['profile'];
  isLoading: boolean;
  onRefreshIngest?: () => void | Promise<void>;
  onToggleVerification: () => void | Promise<void>;
  onToggleFeatured: () => void | Promise<void>;
  onToggleMarketing: () => void | Promise<void>;
  onSendInvite?: () => void;
  onDelete: () => void | Promise<void>;
}>): TableActionMenuItem[] {
  const items: TableActionMenuItem[] = [];

  if (onRefreshIngest) {
    items.push({
      id: 'refresh-ingest',
      label: 'Refresh Ingest',
      icon: RefreshCw,
      disabled: isLoading,
      onClick: () => {
        void onRefreshIngest();
      },
    });
    items.push({ id: 'separator-refresh', label: '' });
  }

  items.push({
    id: 'toggle-verification',
    label: profile.isVerified ? 'Unverify Creator' : 'Verify Creator',
    icon: profile.isVerified ? X : Check,
    onClick: () => {
      void onToggleVerification();
    },
  });

  items.push({
    id: 'toggle-featured',
    label: profile.isFeatured ? 'Unfeature' : 'Feature',
    icon: (
      <Star
        className={cn(
          'h-4 w-4',
          profile.isFeatured && 'fill-warning text-warning'
        )}
      />
    ),
    onClick: () => {
      void onToggleFeatured();
    },
  });

  items.push({ id: 'separator-marketing', label: '' });

  items.push({
    id: 'toggle-marketing',
    label: profile.marketingOptOut
      ? 'Enable Marketing Emails'
      : 'Disable Marketing Emails',
    icon: profile.marketingOptOut ? Mail : MailX,
    onClick: () => {
      void onToggleMarketing();
    },
  });

  items.push({
    id: 'view-profile',
    label: 'View Profile',
    icon: ExternalLink,
    onClick: () => {
      globalThis.open(`/${profile.username}`, '_blank', 'noopener,noreferrer');
    },
  });

  if (!profile.isClaimed && profile.claimToken && onSendInvite) {
    items.push({ id: 'separator-invite', label: '' });
    items.push({
      id: 'send-invite',
      label: 'Send Invite',
      icon: Send,
      onClick: onSendInvite,
    });
  }

  if (!profile.isFeatured) {
    items.push({ id: 'separator-delete', label: '' });
    items.push({
      id: 'delete',
      label: profile.isClaimed ? 'Delete User' : 'Delete Creator',
      icon: Trash2,
      variant: 'destructive',
      onClick: () => {
        void onDelete();
      },
    });
  }

  return items;
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
  const items = buildCreatorActionMenuItems({
    profile,
    isLoading,
    onRefreshIngest,
    onToggleVerification,
    onToggleFeatured,
    onToggleMarketing,
    onSendInvite,
    onDelete,
  });

  const stateClass = cn(
    'transition duration-subtle ease-out transform',
    isSuccess &&
      'animate-pulse motion-reduce:animate-none scale-[1.02] ring-1 ring-(--color-accent)',
    isError &&
      'animate-bounce motion-reduce:animate-none scale-[0.97] ring-1 ring-(--color-destructive)'
  );

  if (!isMobile) {
    return (
      <TableActionMenu
        items={items}
        trigger='custom'
        align='end'
        open={open}
        onOpenChange={onOpenChange}
      >
        <TableRowOverflowTrigger
          ariaLabel='Open Creator Actions'
          disabled={isLoading}
          inert={open || undefined}
        />
      </TableActionMenu>
    );
  }

  return (
    <TableActionMenu
      items={items}
      trigger='custom'
      align='end'
      open={open}
      onOpenChange={onOpenChange}
    >
      <Button
        type='button'
        size='sm'
        variant='ghost'
        className={stateClass}
        disabled={isLoading}
        aria-label='Open Creator Actions'
        inert={open || undefined}
      >
        Actions
        <MoreVertical className='ml-1 h-3.5 w-3.5' />
      </Button>
    </TableActionMenu>
  );
}
