'use client';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@jovie/ui';
import { Copy, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { Icon } from '@/components/atoms/Icon';
import { toast } from '@/components/feedback';
import { SidebarMenuItem } from '@/components/organisms/Sidebar';
import {
  getSidebarNavIconClassName,
  getSidebarNavRowClassName,
} from '@/components/shell/SidebarNavItem';
import { Tooltip } from '@/components/shell/Tooltip';
import { BASE_URL } from '@/constants/domains';
import { copyToClipboard } from '@/hooks/useClipboard';
import { useIsElectronRuntime } from '@/lib/desktop/electron-bridge';
import type { KeyboardShortcut } from '@/lib/keyboard-shortcuts';
import { navigationInputMethodFromClick } from '@/lib/tracking/navigation-telemetry';
import type { NavigationInputMethod } from '@/lib/tracking/navigation-telemetry-contract';
import { cn } from '@/lib/utils';
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
  /** Privacy-safe activation callback for a plain same-tab navigation. */
  readonly onActivate?: (inputMethod: NavigationInputMethod) => void;
  /** When true, keeps link markup but prevents navigation on click */
  readonly preventNavigation?: boolean;
  /** When true, renders a button instead of a link */
  readonly renderAsButton?: boolean;
  /** Hover/focus prefetch handler — wired by DashboardNav, not this component */
  readonly onPrefetch?: () => void;
}

interface NavMenuInteractiveElementProps {
  readonly item: NavItem;
  readonly isActive: boolean;
  readonly prefetch?: boolean;
  readonly preventNavigation: boolean;
  readonly renderAsButton: boolean;
  readonly className: string;
  readonly onButtonClick: () => void;
  readonly onLinkClick: (event: MouseEvent<HTMLAnchorElement>) => void;
  readonly onPressStart: () => void;
  readonly onPrefetch?: () => void;
  readonly children: ReactNode;
}

function NavMenuInteractiveElement({
  item,
  isActive,
  prefetch,
  preventNavigation,
  renderAsButton,
  className,
  onButtonClick,
  onLinkClick,
  onPressStart,
  onPrefetch,
  children,
}: NavMenuInteractiveElementProps) {
  if (renderAsButton) {
    return (
      <button
        type='button'
        onClick={onButtonClick}
        onPointerDown={onPressStart}
        onMouseEnter={onPrefetch}
        onFocus={onPrefetch}
        aria-pressed={isActive}
        className={className}
      >
        {children}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      prefetch={prefetch}
      onClick={onLinkClick}
      onPointerDown={onPressStart}
      onMouseEnter={onPrefetch}
      onFocus={onPrefetch}
      aria-current={isActive ? 'page' : undefined}
      aria-disabled={preventNavigation || undefined}
      className={className}
    >
      {children}
    </Link>
  );
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
  onActivate,
  preventNavigation = false,
  renderAsButton = false,
  onPrefetch,
}: NavMenuItemProps) {
  const isElectronRuntime = useIsElectronRuntime();
  const pendingNavigationRef = useRef(false);
  const clearPendingNavigationListenersRef = useRef<(() => void) | null>(null);

  const handleCopyLink = useCallback(async () => {
    const origin =
      globalThis.window === undefined ? BASE_URL : globalThis.location.origin;
    const url = `${origin}${item.href}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      toast.success('Link copied');
    } else {
      toast.error('Failed to copy link');
    }
  }, [item.href]);

  const handleOpenInNewTab = useCallback(() => {
    const origin =
      globalThis.window === undefined ? BASE_URL : globalThis.location.origin;
    globalThis.open(`${origin}${item.href}`, '_blank', 'noopener,noreferrer');
  }, [item.href]);

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
      const isPlainNavigation =
        !preventNavigation &&
        event.button === 0 &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        !event.altKey;

      if (!hadPendingPointerNavigation && isPlainNavigation) {
        showPendingShell();
      }
      if (isPlainNavigation) {
        onActivate?.(navigationInputMethodFromClick(event.detail));
      }
      onClick?.();

      if (!isPlainNavigation && onNavigate) {
        onCancelNavigate?.();
      }
    },
    [
      clearPendingNavigationListeners,
      onCancelNavigate,
      onClick,
      onActivate,
      onNavigate,
      preventNavigation,
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

  const shellTooltipShortcut = shortcut
    ? {
        keys: shortcut.keys,
        description: shortcut.description ?? shortcut.label,
      }
    : undefined;
  const shellNavClassName = getSidebarNavRowClassName({
    active: isActive,
    tone: item.tone,
    className:
      'group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0',
  });
  const shellInnerContent = (
    <>
      {item.iconName ? (
        <Icon
          name={item.iconName}
          className={getSidebarNavIconClassName({
            active: isActive,
            tone: item.tone,
          })}
          strokeWidth={2.25}
          aria-hidden='true'
        />
      ) : (
        <item.icon
          className={getSidebarNavIconClassName({
            active: isActive,
            tone: item.tone,
          })}
          strokeWidth={2.25}
          aria-hidden='true'
        />
      )}
      <span
        className={cn(
          'min-w-0 w-full justify-self-stretch truncate overflow-hidden whitespace-nowrap text-left',
          '[-webkit-mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)]',
          '[mask-image:linear-gradient(to_right,black_calc(100%_-_1.5rem),transparent)]',
          'group-data-[collapsible=icon]:hidden'
        )}
      >
        {item.name}
      </span>
      {item.badge != null ? (
        <span className='justify-self-end shrink-0 group-data-[collapsible=icon]:hidden'>
          {item.badge}
        </span>
      ) : null}
    </>
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarMenuItem>
          <Tooltip
            label={item.name}
            shortcut={shellTooltipShortcut}
            side='right'
            block
          >
            <NavMenuInteractiveElement
              item={item}
              isActive={isActive}
              prefetch={prefetch}
              preventNavigation={preventNavigation}
              renderAsButton={renderAsButton}
              className={shellNavClassName}
              onButtonClick={handleButtonClick}
              onLinkClick={handleLinkClick}
              onPressStart={handlePressStart}
              onPrefetch={onPrefetch}
            >
              {shellInnerContent}
            </NavMenuInteractiveElement>
          </Tooltip>
          {actions}
          {children}
        </SidebarMenuItem>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={handleCopyLink}>
          <Copy className='mr-2 h-3.5 w-3.5' />
          Copy link
        </ContextMenuItem>
        {isElectronRuntime ? null : (
          <ContextMenuItem onSelect={handleOpenInNewTab}>
            <ExternalLink className='mr-2 h-3.5 w-3.5' />
            Open in new tab
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
