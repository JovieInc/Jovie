'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@jovie/ui';
import { Ellipsis, MessageSquare, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuActions,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES } from '@/constants/routes';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
import { useDeleteConversationMutation } from '@/lib/queries/useChatMutations';
import { cn } from '@/lib/utils';

const MAX_RECENT_CHATS = 10;

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  // Guard against invalid or future dates
  if (Number.isNaN(diffMs) || diffMs < 0) return 'now';

  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return 'now';
  if (diffMins < 60) return `${diffMins}m`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;

  return `${Math.floor(diffDays / 7)}w`;
}

export function RecentChats() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const notifications = useNotifications();
  const activeConversationId = params.id ?? null;

  const { data: conversations } = useChatConversationsQuery({
    limit: MAX_RECENT_CHATS,
  });

  const deleteConversation = useDeleteConversationMutation();

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      await deleteConversation.mutateAsync({
        conversationId: deleteTarget.id,
      });

      if (activeConversationId === deleteTarget.id) {
        router.push(APP_ROUTES.CHAT);
      }

      notifications.success('Chat deleted');
    } catch (err) {
      console.error('Failed to delete conversation:', err);
      notifications.error('Failed to delete chat');
    } finally {
      setDeleteTarget(null);
    }
  }, [
    deleteTarget,
    deleteConversation,
    activeConversationId,
    router,
    notifications,
  ]);

  if (!conversations || conversations.length === 0) {
    return null;
  }

  return (
    <>
      <SidebarCollapsibleGroup label='Recent Chats' defaultOpen={false}>
        <SidebarMenu>
          {conversations.map(convo => {
            const href = `${APP_ROUTES.CHAT}/${convo.id}`;
            const isActive = activeConversationId === convo.id;
            const title = convo.title || 'Untitled chat';
            const updatedAt = new Date(convo.updatedAt);
            const timeAgo = formatRelativeTime(updatedAt);

            return (
              <SidebarMenuItem key={convo.id}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={title}
                  className='h-8'
                >
                  <Link href={href}>
                    <MessageSquare
                      className={cn(
                        'size-4 shrink-0',
                        isActive
                          ? 'text-sidebar-foreground'
                          : 'text-sidebar-muted'
                      )}
                      aria-hidden='true'
                    />
                    <span className='flex-1 truncate text-[13px]'>{title}</span>
                    <span
                      className='shrink-0 text-[10px] tabular-nums text-sidebar-muted group-data-[collapsible=icon]:hidden'
                      title={updatedAt.toLocaleString()}
                    >
                      {timeAgo}
                    </span>
                  </Link>
                </SidebarMenuButton>

                <SidebarMenuActions showOnHover>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction aria-label='Chat options'>
                        <Ellipsis aria-hidden='true' className='size-4' />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side='right' align='start'>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget({ id: convo.id, title })}
                        className='text-destructive focus:text-destructive'
                      >
                        <Trash2 className='size-4' aria-hidden='true' />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuActions>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarCollapsibleGroup>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={open => {
          if (!open && !deleteConversation.isPending) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className='max-w-sm'>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &ldquo;
              {deleteTarget?.title ?? 'Untitled chat'}&rdquo;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteConversation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={handleDeleteConfirm}
              disabled={deleteConversation.isPending}
            >
              {deleteConversation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
