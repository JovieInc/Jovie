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
import { useRouter } from 'next/navigation';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
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
  readonly onCancelNavigate?: () => void;
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
        <span className='text-3xs opacity-70'>then</span>
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
  onCancelNavigate,
  onClick,
  preventNavigation = false,
  renderAsButton = false,
  onPrefetch,
}: NavMenuItemProps) {
  const router = useRouter();
  const pendingNavigationRef = useRef(false);
  const clearPendingNavigationListenersRef = useRef<(() => void) | null>(null);
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
        className='flex h-4 w-4 shrink-0 items-center justify-center'
      >
        <item.icon className='h-4 w-4' strokeWidth={1.9} aria-hidden='true' />
      </span>
      <span className='truncate group-data-[collapsible=icon]:hidden'>
        {item.name}
      </span>
    </>
  );

  const showPendingShell = useCallback(() => {
    if (!onNavigate) {
      return;
    }

    onNavigate();
  }, [onNavigate]);

  const clearPendingNavigationListeners = useCallback(() => {
    clearPendingNavigationListenersRef.current?.();
    clearPendingNavigationListenersRef.current = null;
  }, []);

  const cancelPendingNavigation = useCallback(() => {
    if (!pendingNavigationRef.current) {
      return;
    }

    pendingNavigationRef.current = false;
    clearPendingNavigationListeners();
    onCancelNavigate?.();
  }, [clearPendingNavigationListeners, onCancelNavigate]);

  useEffect(
    () => clearPendingNavigationListeners,
    [clearPendingNavigationListeners]
  );

  const handleButtonClick = useCallback(() => {
    const hadPendingPointerNavigation = pendingNavigationRef.current;
    pendingNavigationRef.current = false;
    clearPendingNavigationListeners();
    if (!hadPendingPointerNavigation) {
      showPendingShell();
    }
    onClick?.();
  }, [clearPendingNavigationListeners, onClick, showPendingShell]);

  const handleLinkClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const hadPendingPointerNavigation = pendingNavigationRef.current;
      pendingNavigationRef.current = false;
      clearPendingNavigationListeners();
      if (preventNavigation) {
        event.preventDefault();
      }
      const shouldInterceptNavigation =
        !preventNavigation &&
        Boolean(onNavigate) &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey;

      if (!hadPendingPointerNavigation && shouldInterceptNavigation) {
        showPendingShell();
      }
      onClick?.();

      if (!shouldInterceptNavigation && onNavigate) {
        onCancelNavigate?.();
      }

      if (shouldInterceptNavigation) {
        event.preventDefault();
        requestAnimationFrame(() => {
          router.push(item.href);
        });
      }
    },
    [
      item.href,
      clearPendingNavigationListeners,
      onCancelNavigate,
      onClick,
      onNavigate,
      preventNavigation,
      router,
      showPendingShell,
    ]
  );

  const handlePressStart = useCallback(() => {
    if (onNavigate && globalThis.window !== undefined) {
      pendingNavigationRef.current = true;
      clearPendingNavigationListeners();

      const handlePointerUp = () => {
        setTimeout(() => {
          if (pendingNavigationRef.current) {
            cancelPendingNavigation();
          }
        }, 0);
      };
      const handlePointerCancel = () => {
        cancelPendingNavigation();
      };

      globalThis.addEventListener('pointerup', handlePointerUp, true);
      globalThis.addEventListener('pointercancel', handlePointerCancel, true);
      globalThis.addEventListener('blur', handlePointerCancel);
      clearPendingNavigationListenersRef.current = () => {
        globalThis.removeEventListener('pointerup', handlePointerUp, true);
        globalThis.removeEventListener(
          'pointercancel',
          handlePointerCancel,
          true
        );
        globalThis.removeEventListener('blur', handlePointerCancel);
      };
    }

    showPendingShell();
    onPrefetch?.();
  }, [
    cancelPendingNavigation,
    clearPendingNavigationListeners,
    onNavigate,
    onPrefetch,
    showPendingShell,
  ]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <SidebarMenuButton asChild isActive={isActive} tooltip={tooltip}>
            {renderAsButton ? (
              <button
                type='button'
                onClick={handleButtonClick}
                onPointerDown={handlePressStart}
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
                onPointerDown={handlePressStart}
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
