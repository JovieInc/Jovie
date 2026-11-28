'use client';

import { Popover, PopoverAnchor, PopoverContent } from '@jovie/ui';
import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from '@/components/shell/SidebarNavItem';
import { APP_ROUTES } from '@/constants/routes';
import { cn } from '@/lib/utils';

export function SidebarChatAction({
  current,
  pending,
  recentChats,
  onActivate,
}: Readonly<{
  current: boolean;
  pending: boolean;
  recentChats: ReactNode;
  onActivate: (event: MouseEvent<HTMLAnchorElement>) => void;
}>) {
  const [open, setOpen] = useState(false);
  const keyboard = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const link = useRef<HTMLAnchorElement>(null);
  const id = useId();
  const shown = Boolean(recentChats && open);

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function closeAfterLeaving() {
    if (keyboard.current) return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <Popover open={shown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className='sidebar-pen-chat-anchor'
          onPointerEnter={event => {
            if (event.pointerType !== 'mouse' || !recentChats) return;
            cancelClose();
            setOpen(true);
          }}
          onPointerLeave={closeAfterLeaving}
        >
          <Link
            ref={link}
            href={APP_ROUTES.CHAT}
            prefetch={false}
            aria-current={current ? 'page' : undefined}
            aria-busy={pending || undefined}
            aria-expanded={recentChats ? shown : undefined}
            aria-controls={shown ? id : undefined}
            aria-describedby={recentChats ? `${id}-hint` : undefined}
            data-navigation-item-id='chat'
            data-navigation-pending={pending || undefined}
            className={cn(
              getSidebarNavRowClassName({
                calm: true,
                active: current || pending,
              }),
              'sidebar-pen-entry sidebar-pen-action'
            )}
            onClick={event => {
              keyboard.current = false;
              setOpen(false);
              onActivate(event);
            }}
            onKeyDown={event => {
              if (event.key !== 'ArrowRight' || !recentChats) return;
              event.preventDefault();
              cancelClose();
              keyboard.current = true;
              setOpen(true);
              if (shown) document.getElementById(id)?.focus();
            }}
          >
            <MessageCircle
              className={getSidebarNavIconClassName({ calm: true })}
              aria-hidden='true'
            />
            <span className='sidebar-pen-label'>Chat</span>
          </Link>
          <span id={`${id}-hint`} className='sr-only'>
            Press Right Arrow for recent chats.
          </span>
        </div>
      </PopoverAnchor>
      {recentChats ? (
        <PopoverContent
          id={id}
          aria-label='Recent Chats'
          side='right'
          align='start'
          sideOffset={0}
          tabIndex={-1}
          onPointerEnter={cancelClose}
          onPointerLeave={closeAfterLeaving}
          onOpenAutoFocus={event => {
            event.preventDefault();
            if (keyboard.current && event.target instanceof HTMLElement)
              event.target.focus();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            keyboard.current = false;
          }}
          onEscapeKeyDown={event => {
            event.preventDefault();
            setOpen(false);
            link.current?.focus();
          }}
        >
          {recentChats}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
