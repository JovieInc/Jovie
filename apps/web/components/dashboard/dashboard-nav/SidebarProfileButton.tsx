'use client';

import { User } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { usePreviewPanelState } from '@/app/app/(shell)/dashboard/PreviewPanelContext';
import { Avatar } from '@/components/molecules/Avatar';
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { APP_ROUTES } from '@/constants/routes';

interface SidebarProfileButtonProps {
  readonly displayName: string;
  readonly avatarUrl?: string | null;
}

/**
 * Sidebar button that opens the user's profile in the right drawer.
 *
 * Behaviour:
 *  - If already on a chat route, just opens the profile drawer.
 *  - Otherwise navigates to /app/chat first, then opens the drawer.
 *  - On mobile the RightDrawer renders full-screen automatically.
 */
export function SidebarProfileButton({
  displayName,
  avatarUrl,
}: SidebarProfileButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { open } = usePreviewPanelState();

  const handleClick = useCallback(() => {
    const isOnChat = pathname.startsWith(APP_ROUTES.CHAT);

    if (isOnChat) {
      // Already on the chat route — just toggle the drawer open
      open();
    } else {
      // Navigate to a new chat, then open the drawer after navigation
      router.push(APP_ROUTES.CHAT);
      // Use a microtask so the navigation starts before we open the panel.
      // The PreviewPanelProvider is mounted at the shell level so `open`
      // works even before the chat page renders.
      queueMicrotask(() => {
        open();
      });
    }
  }, [pathname, open, router]);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild tooltip={displayName}>
        <button
          type='button'
          onClick={handleClick}
          aria-label={`Open ${displayName} profile`}
          className='flex w-full min-w-0 items-center gap-2 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center'
        >
          <span
            data-sidebar-icon
            className='flex size-5 shrink-0 items-center justify-center'
          >
            {avatarUrl ? (
              <Avatar
                src={avatarUrl}
                alt={displayName}
                name={displayName}
                size='xs'
                rounded='full'
              />
            ) : (
              <User className='size-3.5' aria-hidden='true' />
            )}
          </span>
          <span className='truncate group-data-[collapsible=icon]:hidden'>
            {displayName}
          </span>
        </button>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
