'use client';

import { MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { SidebarCollapsibleGroup } from '@/components/organisms/SidebarCollapsibleGroup';
import { APP_ROUTES } from '@/constants/routes';
import { useChatConversationsQuery } from '@/lib/queries/useChatConversationsQuery';
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
  const searchParams = useSearchParams();
  const activeConversationId = searchParams.get('conversation');

  const { data: conversations } = useChatConversationsQuery({
    limit: MAX_RECENT_CHATS,
  });

  if (!conversations || conversations.length === 0) {
    return null;
  }

  return (
    <SidebarCollapsibleGroup label='Recent Chats' defaultOpen={false}>
      <SidebarMenu>
        {conversations.map(convo => {
          const href = `${APP_ROUTES.PROFILE}?conversation=${convo.id}`;
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
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarCollapsibleGroup>
  );
}
