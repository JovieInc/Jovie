'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  Kbd,
} from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { type MouseEvent, type ReactNode, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/organisms/Sidebar';
import { BASE_URL } from '@/constants/domains';
import { copyToClipboard } from '@/hooks/useClipboard';
import type { KeyboardShortcut } from '@/lib/keyboard-shortcuts';
import type { NavItem } from './types';

interface NavMenuItemProps {
  readonly item: NavItem;
  readonly isActive: boolean;
  readonly shortcut?: KeyboardShortcut;
  readonly prefetch?: boolean;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly onNavigate?: () => void;
  /** Optional click side effect for links or buttons */
  readonly onClick?: () => void;
  /** When true, keeps link markup but prevents navigation on click */
  readonly preventNavigation?: boolean;
  /** When true, renders a button instead of a link */
  readonly renderAsButton?: boolean;
  /** Hover/focus prefetch handler — wired by DashboardNav, not this component */
  readonly onPrefetch?: () => void;
}

/**
 * Render shortcut keys in tooltip format
 * Handles both "G then D" sequential and single key formats
 */
function ShortcutKeys({ shortcut }: { readonly shortcut: KeyboardShortcut }) {
  const { keys } = shortcut;

  // Handle "G then D" style sequential shortcuts
  if (keys.includes(' then ')) {
    const [first, second] = keys.split(' then ');
    return (
      <span className='inline-flex items-center gap-1 ml-2'>
        <Kbd variant='tooltip'>{first}</Kbd>
        <span className='text-[10px] opacity-70'>then</span>
        <Kbd variant='tooltip'>{second}</Kbd>
      </span>
    );
  }

  // Handle space-separated keys (like "⌘ K")
  return (
    <Kbd variant='tooltip' className='ml-2'>
      {keys}
    </Kbd>
  );
}

function buildTooltip(
  name: string,
  shortcut?: KeyboardShortcut
): string | { children: ReactNode } {
  if (!shortcut) {
    return name;
  }

  return {
    children: (
      <>
        <span>{name}</span>
        <ShortcutKeys shortcut={shortcut} />
      </>
    ),
  };
}

export function NavMenuItem({
  item,
  isActive,
  shortcut,
  prefetch,
  actions,
  children,
  onNavigate,
  onClick,
  preventNavigation = false,
  renderAsButton = false,
  onPrefetch,
}: NavMenuItemProps) {
  // Memoize tooltip to prevent creating new objects on every render,
  // which would cause unnecessary re-renders in SidebarMenuButton
  const tooltip = useMemo(
    () => buildTooltip(item.name, shortcut),
    [item.name, shortcut]
  );

  const handleCopyLink = useCallback(async () => {
    const origin =
      globalThis.window === undefined ? BASE_URL : globalThis.location.origin;
    const url = `${origin}${item.href}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      toast.success('Link copied to clipboard');
    } else {
      toast.error('Failed to copy link');
    }
  }, [item.href]);

  const handleOpenInNewTab = useCallback(() => {
    const origin =
      globalThis.window === undefined ? BASE_URL : globalThis.location.origin;
    globalThis.open(`${origin}${item.href}`, '_blank', 'noopener,noreferrer');
  }, [item.href]);

  const innerContent = (
    <>
      {/* Fixed-width icon container keeps sidebar glyphs optically quiet. */}
      <span
        data-sidebar-icon
        className='flex size-3 shrink-0 items-center justify-center'
      >
        <item.icon className='size-3' aria-hidden='true' />
      </span>
      <span className='truncate group-data-[collapsible=icon]:hidden'>
        {item.name}
      </span>
    </>
  );

  const handleButtonClick = useCallback(() => {
    onNavigate?.();
    onClick?.();
  }, [onClick, onNavigate]);

  const handleLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (preventNavigation) {
        event.preventDefault();
      }
      onNavigate?.();
      onClick?.();
    },
    [onClick, onNavigate, preventNavigation]
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
            {renderAsButton ? (
              <button
                type='button'
                onClick={handleButtonClick}
                onMouseDown={onPrefetch}
                onMouseEnter={onPrefetch}
                onFocus={onPrefetch}
                aria-pressed={isActive}
                className='flex w-full min-w-0 items-center group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center'
              >
                {innerContent}
              </button>
            ) : (
              <Link
                href={item.href}
                prefetch={prefetch}
                onClick={handleLinkClick}
                onMouseDown={onPrefetch}
                onMouseEnter={onPrefetch}
                onFocus={onPrefetch}
                aria-current={isActive ? 'page' : undefined}
                aria-disabled={preventNavigation || undefined}
                className='flex w-full min-w-0 items-center group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:justify-center'
              >
                {innerContent}
              </Link>
            )}
          </SidebarMenuButton>
          {item.badge != null && (
            <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
          )}
          {actions}
          {children}
        </SidebarMenuItem>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleCopyLink}>
          <Copy className='mr-2 h-3.5 w-3.5' />
          Copy link
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleOpenInNewTab}>
          <ExternalLink className='mr-2 h-3.5 w-3.5' />
          Open in new tab
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
