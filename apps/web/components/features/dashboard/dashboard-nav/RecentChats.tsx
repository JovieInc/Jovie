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
  Skeleton,
} from '@jovie/ui';
import { Copy, Ellipsis, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuActions,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import {
  type SidebarThread,
  SidebarThreadsSection,
} from '@/components/shell/SidebarThreadsSection';
import { APP_ROUTES } from '@/constants/routes';
import { captureError } from '@/lib/error-tracking';
import { useAppFlag } from '@/lib/flags/client';
import { useNotifications } from '@/lib/hooks/useNotifications';
import {
  useChatConversationsQuery,
  useDeleteConversationMutation,
} from '@/lib/queries';

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
  const designV1Enabled = useAppFlag('DESIGN_V1');
  const activeConversationId = params.id ?? null;

  const { data: conversations, isLoading } = useChatConversationsQuery({
    limit: MAX_RECENT_CHATS,
  });

  const deleteConversation = useDeleteConversationMutation();

  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  // Track which thread's dropdown menu is open so only one can be open at a time
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [shellActionMenu, setShellActionMenu] = useState<{
    thread: SidebarThread;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!shellActionMenu) return;

    const closeMenu = () => setShellActionMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    globalThis.addEventListener('pointerdown', closeMenu);
    globalThis.addEventListener('keydown', closeOnEscape);
    return () => {
      globalThis.removeEventListener('pointerdown', closeMenu);
      globalThis.removeEventListener('keydown', closeOnEscape);
    };
  }, [shellActionMenu]);

  const copySessionId = useCallback(
    async (conversationId: string) => {
      try {
        await navigator.clipboard.writeText(conversationId);
        notifications.success('Session ID copied');
      } catch {
        notifications.error('Could not copy session ID');
      }
    },
    [notifications]
  );

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;

    try {
      await deleteConversation.mutateAsync({
        conversationId: deleteTarget.id,
      });

      if (activeConversationId === deleteTarget.id) {
        router.push(APP_ROUTES.CHAT);
      }

      notifications.success('Thread deleted');
    } catch (err) {
      captureError('Failed to delete conversation', err, {
        conversationId: deleteTarget.id,
      });
      notifications.error('Failed to delete thread');
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

  if (isLoading) {
    return (
      <SidebarCollapsibleGroup label='Threads' defaultOpen={false}>
        <SidebarMenu>
          {(['a', 'b', 'c'] as const).map(id => (
            <SidebarMenuItem key={`skeleton-${id}`}>
              <div className='flex h-7 items-center px-1.5'>
                <Skeleton className='h-3 flex-1' rounded='sm' />
              </div>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarCollapsibleGroup>
    );
  }

  if (!conversations || conversations.length === 0) {
    return null;
  }

  if (designV1Enabled) {
    const shellThreads: SidebarThread[] = conversations.map(convo => ({
      id: convo.id,
      title: convo.title || 'Untitled Thread',
      status: 'complete',
      updatedAt: new Date(convo.updatedAt).toISOString(),
    }));

    return (
      <>
        <SidebarThreadsSection
          threads={shellThreads}
          activeThreadId={activeConversationId}
          onSelect={id => router.push(`${APP_ROUTES.CHAT}/${id}`)}
          onThreadContextMenu={(event, thread) => {
            event.preventDefault();
            event.stopPropagation();
            setShellActionMenu({
              thread,
              x: event.clientX || 16,
              y: event.clientY || 16,
            });
          }}
          collapsed={false}
          tight
        />

        {shellActionMenu && (
          <div
            role='menu'
            className='fixed z-50 min-w-36 overflow-hidden rounded-lg border border-sidebar-border/80 bg-base py-1 text-sidebar-item-foreground shadow-lg'
            style={{
              left: shellActionMenu.x,
              top: shellActionMenu.y,
            }}
            onPointerDown={event => event.stopPropagation()}
          >
            <button
              type='button'
              role='menuitem'
              onClick={() => {
                void copySessionId(shellActionMenu.thread.id);
                setShellActionMenu(null);
              }}
              className='flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none'
            >
              <Copy className='size-3.5' aria-hidden='true' />
              Copy Session ID
            </button>
            <button
              type='button'
              role='menuitem'
              onClick={() => {
                setDeleteTarget({
                  id: shellActionMenu.thread.id,
                  title: shellActionMenu.thread.title,
                });
                setShellActionMenu(null);
              }}
              className='flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-2xs text-destructive hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none'
            >
              <Trash2 className='size-3.5' aria-hidden='true' />
              Delete
            </button>
          </div>
        )}

        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={open => {
            if (!open && !deleteConversation.isPending) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent className='max-w-sm'>
            <AlertDialogHeader>
              <AlertDialogTitle className='text-sm font-semibold text-primary-token'>
                Delete Thread
              </AlertDialogTitle>
              <AlertDialogDescription className='text-app text-secondary-token'>
                This will permanently delete &ldquo;
                {deleteTarget?.title ?? 'Untitled Thread'}&rdquo;. This action
                cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className='gap-2 sm:gap-2'>
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

  return (
    <>
      <SidebarCollapsibleGroup label='Threads' defaultOpen>
        <SidebarMenu>
          {conversations.map(convo => {
            const href = `${APP_ROUTES.CHAT}/${convo.id}`;
            const isActive = activeConversationId === convo.id;
            const title = convo.title || 'Untitled Thread';
            const updatedAt = new Date(convo.updatedAt);
            const timeAgo = formatRelativeTime(updatedAt);

            return (
              <SidebarMenuItem key={convo.id}>
                <SidebarMenuButton
                  asChild
                  isActive={isActive}
                  tooltip={title}
                  className='h-7'
                >
                  <Link href={href}>
                    <span className='flex-1 truncate text-app'>{title}</span>
                  </Link>
                </SidebarMenuButton>

                <span
                  className='absolute right-1 top-1 flex h-5 items-center px-1 text-3xs tabular-nums text-sidebar-muted pointer-events-none transition-opacity duration-150 group-hover/menu-item:opacity-0 group-focus-within/menu-item:opacity-0 group-data-[collapsible=icon]:hidden'
                  title={updatedAt.toLocaleString()}
                >
                  {timeAgo}
                </span>

                <SidebarMenuActions showOnHover>
                  <DropdownMenu
                    open={openMenuId === convo.id}
                    onOpenChange={open => setOpenMenuId(open ? convo.id : null)}
                  >
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuAction aria-label='Thread options'>
                        <Ellipsis aria-hidden='true' className='size-3.5' />
                      </SidebarMenuAction>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side='bottom' align='end'>
                      <DropdownMenuItem
                        onClick={() => {
                          void copySessionId(convo.id);
                        }}
                      >
                        <Copy className='size-3.5' aria-hidden='true' />
                        Copy Session ID
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteTarget({ id: convo.id, title })}
                        className='text-destructive focus:text-destructive'
                      >
                        <Trash2 className='size-3.5' aria-hidden='true' />
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
            <AlertDialogTitle className='text-sm font-semibold text-primary-token'>
              Delete Thread
            </AlertDialogTitle>
            <AlertDialogDescription className='text-app text-secondary-token'>
              This will permanently delete &ldquo;
              {deleteTarget?.title ?? 'Untitled Thread'}&rdquo;. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className='gap-2 sm:gap-2'>
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
