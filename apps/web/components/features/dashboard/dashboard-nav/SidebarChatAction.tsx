'use client';

import { Input, Popover, PopoverAnchor, PopoverContent } from '@jovie/ui';
import { MessageCircle, Search } from 'lucide-react';
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
import { useBreakpointDown } from '@/hooks/useBreakpoint';
import { cn } from '@/lib/utils';
import './SidebarChatAction.css';

export function SidebarChatAction({
  current,
  pending,
  renderRecentChats,
  onActivate,
}: Readonly<{
  current: boolean;
  pending: boolean;
  renderRecentChats?: (query: string) => ReactNode;
  onActivate: (event: MouseEvent<HTMLAnchorElement>) => void;
}>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sideOffset, setSideOffset] = useState(0);
  const [scrollMore, setScrollMore] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const keyboard = useRef(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const link = useRef<HTMLAnchorElement>(null);
  const id = useId();
  const compactViewport = useBreakpointDown('sm');
  const shown = Boolean(renderRecentChats && open);

  function cancelClose() {
    clearTimeout(closeTimer.current);
  }

  function openHistory(anchor: HTMLElement) {
    const main = anchor
      .closest('[data-app-shell-frame]')
      ?.querySelector('[data-app-shell-main-plane]');
    const railEdge = anchor.getBoundingClientRect().right;
    setSideOffset(
      Math.max(0, (main?.getBoundingClientRect().left ?? railEdge) - railEdge)
    );
    if (!shown) setQuery('');
    setOpen(true);
  }

  function syncScrollFade() {
    const el = viewport.current;
    if (el) setScrollMore(el.scrollHeight - el.clientHeight - el.scrollTop > 1);
  }

  function closeAfterLeaving() {
    if (
      keyboard.current ||
      viewport.current?.parentElement?.contains(document.activeElement)
    )
      return;
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const el = viewport.current;
    if (!shown || !el) return;
    syncScrollFade();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(syncScrollFade);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [shown]);

  return (
    <Popover open={shown} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className='sidebar-pen-chat-anchor'
          onPointerEnter={event => {
            if (event.pointerType !== 'mouse' || !renderRecentChats) return;
            cancelClose();
            openHistory(event.currentTarget);
          }}
          onPointerLeave={closeAfterLeaving}
        >
          <Link
            ref={link}
            href={APP_ROUTES.CHAT}
            prefetch={false}
            aria-label='Chat'
            aria-current={current ? 'page' : undefined}
            aria-busy={pending || undefined}
            aria-expanded={renderRecentChats ? shown : undefined}
            aria-controls={shown ? id : undefined}
            aria-describedby={renderRecentChats ? `${id}-hint` : undefined}
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
              if (event.key !== 'ArrowRight' || !renderRecentChats) return;
              event.preventDefault();
              cancelClose();
              keyboard.current = true;
              if (shown) document.getElementById(id)?.focus();
              else if (event.currentTarget.parentElement)
                openHistory(event.currentTarget.parentElement);
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
      {renderRecentChats ? (
        <PopoverContent
          id={id}
          aria-label='Recent Chats'
          side={compactViewport ? 'bottom' : 'right'}
          align='start'
          sideOffset={compactViewport ? undefined : sideOffset}
          size='bare'
          className='w-(--app-shell-sidebar-chat-history-width) min-w-0'
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
          <div className='sidebar-recent-chats'>
            <div className='sidebar-recent-chats-search'>
              <label htmlFor={`${id}-search`}>
                <Search size={16} aria-hidden='true' />
              </label>
              <Input
                inputSize='sm'
                id={`${id}-search`}
                type='search'
                aria-label='Search Chats'
                placeholder='Search chats'
                value={query}
                onChange={event => setQuery(event.target.value)}
              />
            </div>
            <div
              ref={viewport}
              className='sidebar-recent-chats-list'
              onScroll={syncScrollFade}
              data-scroll-more={scrollMore || undefined}
            >
              <div>{renderRecentChats(query)}</div>
            </div>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
