'use client';

import { LogOut, MoreHorizontal, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ComponentType,
  type SVGProps,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useModalFocusBoundary } from '@/lib/a11y/modal-focus-boundary';
import { navigationInputMethodFromClick } from '@/lib/tracking/navigation-telemetry';
import type { NavigationInputMethod } from '@/lib/tracking/navigation-telemetry-contract';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type LiquidGlassMenuItem = {
  id: string;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  badge?: number;
};

export interface LiquidGlassMenuProps {
  readonly primaryItems: LiquidGlassMenuItem[];
  readonly expandedItems: LiquidGlassMenuItem[];
  /** Non-primary account destinations rendered after the canonical app IA. */
  readonly utilityItems?: LiquidGlassMenuItem[];
  /** Optional admin items - shown in a separate section with header */
  readonly adminItems?: LiquidGlassMenuItem[];
  readonly onSearchClick?: () => void;
  readonly onSignOut?: () => void;
  readonly navigationLabel?: string;
  readonly expandedNavigationLabel?: string;
  readonly className?: string;
  /**
   * Render inside the authenticated shell's shared bottom surface instead of
   * creating a second fixed/elevated layer.
   */
  readonly inFlow?: boolean;
  readonly onItemActivate?: (
    item: LiquidGlassMenuItem,
    inputMethod: NavigationInputMethod
  ) => void;
  readonly onExpandedItemsVisible?: (
    items: readonly LiquidGlassMenuItem[]
  ) => void;
  readonly isItemActive?: (
    item: LiquidGlassMenuItem,
    pathname: string
  ) => boolean;
}

// ============================================================================
// Styles
// ============================================================================

const GLASS_LAYER_STYLES = {
  highlight: {
    background: 'var(--liquid-glass-highlight)',
    mixBlendMode: 'plus-lighter' as const,
    opacity: 0.5,
  },
  highlightSubtle: {
    background: 'var(--liquid-glass-highlight)',
    mixBlendMode: 'plus-lighter' as const,
    opacity: 0.3,
  },
  blur: {
    backdropFilter: 'blur(var(--liquid-glass-blur-intense))',
    WebkitBackdropFilter: 'blur(var(--liquid-glass-blur-intense))',
  },
  blurLight: {
    backdropFilter: 'blur(var(--liquid-glass-blur))',
    WebkitBackdropFilter: 'blur(var(--liquid-glass-blur))',
  },
} as const;

// ============================================================================
// Helpers
// ============================================================================

function formatBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}

function useCloseOnEscapeOrOutside(
  ref: React.RefObject<HTMLElement | null>,
  isOpen: boolean,
  onClose: () => void
): void {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Small delay prevents immediate close when opening via click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      document.removeEventListener('keydown', handleEscape);
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [ref, isOpen, onClose]);
}

// ============================================================================
// Sub-components
// ============================================================================

function GlassHighlight({
  subtle = false,
  rounded = true,
}: {
  readonly subtle?: boolean;
  readonly rounded?: boolean;
}) {
  return (
    <div
      className={cn(
        'absolute inset-0 pointer-events-none',
        rounded && 'rounded-lg'
      )}
      style={
        subtle
          ? GLASS_LAYER_STYLES.highlightSubtle
          : GLASS_LAYER_STYLES.highlight
      }
      aria-hidden='true'
    />
  );
}

function GlassBlur({
  intense = false,
  rounded = true,
}: {
  readonly intense?: boolean;
  readonly rounded?: boolean;
}) {
  return (
    <div
      className={cn('absolute inset-0', rounded && 'rounded-lg')}
      style={intense ? GLASS_LAYER_STYLES.blur : GLASS_LAYER_STYLES.blurLight}
      aria-hidden='true'
    />
  );
}

function Badge({
  count,
  size = 'md',
}: {
  readonly count: number;
  readonly size?: 'sm' | 'md';
}) {
  if (count <= 0) return null;

  const sizeClasses =
    size === 'sm' ? 'min-w-4 h-4 px-1 text-3xs' : 'min-w-6 h-5 px-2 text-xs';

  return (
    <span
      className={cn(
        'flex items-center justify-center font-caption rounded-full bg-accent text-on-accent',
        sizeClasses
      )}
    >
      {formatBadge(count)}
    </span>
  );
}

function MenuItemLink({
  item,
  active,
  onActivate,
}: {
  readonly item: LiquidGlassMenuItem;
  readonly active: boolean;
  readonly onActivate?: (inputMethod: NavigationInputMethod) => void;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={event => {
        if (
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          onActivate?.(navigationInputMethodFromClick(event.detail));
        }
      }}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-app font-caption transition-[background-color,color] duration-subtle ease-subtle active:bg-surface-2',
        active
          ? 'bg-bg-surface-2 text-primary-token'
          : 'text-secondary-token hover:text-primary-token hover:bg-surface-1'
      )}
    >
      <Icon
        className={cn(
          'size-5 shrink-0',
          active ? 'text-primary-token' : 'text-tertiary-token'
        )}
        aria-hidden='true'
      />
      <span className='flex-1'>{item.label}</span>
      {item.badge !== undefined && <Badge count={item.badge} />}
    </Link>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LiquidGlassMenu({
  primaryItems,
  expandedItems,
  utilityItems = [],
  adminItems,
  onSearchClick,
  onSignOut,
  navigationLabel = 'Dashboard Tabs',
  expandedNavigationLabel = 'Expanded Navigation Menu',
  className,
  inFlow = false,
  onItemActivate,
  onExpandedItemsVisible,
  isItemActive,
}: LiquidGlassMenuProps): React.JSX.Element {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const expandedMenuRef = useRef<HTMLElement>(null);
  const expandedDialogRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const expandedDialogId = useId();
  const previousPathnameRef = useRef(pathname);

  const closeMenu = useCallback(() => {
    setIsExpanded(false);
  }, []);
  const closeMenuAndRestoreFocus = useCallback(() => {
    closeMenu();
    globalThis.requestAnimationFrame(() => moreButtonRef.current?.focus());
  }, [closeMenu]);
  const toggleMenu = useCallback(() => {
    if (isExpanded) {
      closeMenuAndRestoreFocus();
      return;
    }
    setIsExpanded(true);
  }, [closeMenuAndRestoreFocus, isExpanded]);

  useCloseOnEscapeOrOutside(menuRef, isExpanded, closeMenuAndRestoreFocus);
  // Escape/backdrop closures restore focus explicitly; route changes must not
  // pull focus away from the destination page during modal cleanup.
  useModalFocusBoundary(expandedDialogRef, isExpanded, false);

  // Move keyboard focus into the menu as soon as it opens.
  useEffect(() => {
    if (!isExpanded) return;
    onExpandedItemsVisible?.([...expandedItems, ...utilityItems]);
    expandedMenuRef.current
      ?.querySelector<HTMLElement>('a[href], button:not([disabled])')
      ?.focus();
  }, [expandedItems, isExpanded, onExpandedItemsVisible, utilityItems]);

  // Close on route change without stealing focus from the destination page.
  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    if (isExpanded) closeMenu();
  }, [closeMenu, isExpanded, pathname]);

  const isActive = (item: LiquidGlassMenuItem) => {
    if (isItemActive) return isItemActive(item, pathname);
    if (item.href === '/app') return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  };

  const allMenuItems = [...primaryItems, ...expandedItems];
  const hasAdminItems = adminItems && adminItems.length > 0;

  return (
    <div
      ref={menuRef}
      data-mobile-navigation='true'
      data-layout={inFlow ? 'in-flow' : 'overlay'}
      className={cn(
        inFlow
          ? 'relative z-0 shrink-0 lg:hidden'
          : 'fixed bottom-0 inset-x-0 z-40 lg:hidden',
        className
      )}
    >
      {/* Closed menu content is unmounted so hidden links cannot receive focus. */}
      {isExpanded ? (
        <div className='absolute inset-x-0 bottom-full'>
          {/* Backdrop */}
          <div
            data-modal-backdrop
            className='fixed inset-0 z-50 bg-black/20 backdrop-blur-sm'
            onClick={closeMenuAndRestoreFocus}
            aria-hidden='true'
          />

          {/* Expanded menu */}
          <div
            ref={expandedDialogRef}
            id={expandedDialogId}
            role='dialog'
            aria-modal='true'
            aria-label={expandedNavigationLabel}
            tabIndex={-1}
            className='relative z-50 mx-3 mb-2 overflow-hidden rounded-xl'
            style={{
              background: 'var(--liquid-glass-bg-solid)',
              boxShadow: 'var(--liquid-glass-shadow-elevated)',
              border: '1px solid var(--liquid-glass-border)',
            }}
          >
            <GlassHighlight />
            <GlassBlur intense />

            <nav
              ref={expandedMenuRef}
              className='relative z-10 max-h-[70svh] overflow-y-auto overscroll-contain py-2'
              aria-label={expandedNavigationLabel}
            >
              {/* Menu items */}
              <div className='px-2'>
                {allMenuItems.map(item => (
                  <MenuItemLink
                    key={item.id}
                    item={item}
                    active={isActive(item)}
                    onActivate={inputMethod =>
                      onItemActivate?.(item, inputMethod)
                    }
                  />
                ))}

                {utilityItems.length > 0 ? (
                  <>
                    <div className='my-2 mx-1 border-t border-default/30' />
                    {utilityItems.map(item => (
                      <MenuItemLink
                        key={item.id}
                        item={item}
                        active={isActive(item)}
                        onActivate={inputMethod =>
                          onItemActivate?.(item, inputMethod)
                        }
                      />
                    ))}
                  </>
                ) : null}

                {/* Admin section */}
                {hasAdminItems && (
                  <>
                    <div className='my-2 mx-1 border-t border-default/30' />
                    <p className='px-3 py-1.5 text-app font-caption tracking-normal text-secondary-token'>
                      Admin
                    </p>
                    {adminItems.map(item => (
                      <MenuItemLink
                        key={item.id}
                        item={item}
                        active={isActive(item)}
                        onActivate={inputMethod =>
                          onItemActivate?.(item, inputMethod)
                        }
                      />
                    ))}
                  </>
                )}

                {/* Sign out */}
                {onSignOut && (
                  <>
                    <div className='my-2 mx-1 border-t border-default/30' />
                    <button
                      type='button'
                      onClick={onSignOut}
                      className='flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-app font-caption text-secondary-token transition-[background-color,color] duration-subtle ease-subtle hover:bg-surface-1 hover:text-primary-token active:bg-surface-2'
                    >
                      <LogOut
                        className='size-5 shrink-0 text-tertiary-token'
                        aria-hidden='true'
                      />
                      <span className='flex-1 text-left'>Sign out</span>
                    </button>
                  </>
                )}
              </div>
            </nav>
          </div>
        </div>
      ) : null}

      {/* Bottom tab bar */}
      <nav
        aria-label={navigationLabel}
        className='relative z-50'
        style={{
          background: inFlow ? 'transparent' : 'var(--liquid-glass-bg-solid)',
          boxShadow:
            inFlow || isExpanded ? 'none' : 'var(--liquid-glass-shadow)',
          borderTop: inFlow
            ? '1px solid transparent'
            : '1px solid var(--liquid-glass-border)',
        }}
      >
        <GlassHighlight subtle rounded={false} />
        <GlassBlur rounded={false} />

        <div className='relative z-10 flex items-stretch justify-around px-2 pb-[calc(env(safe-area-inset-bottom)+4px)] pt-1.5'>
          {/* Primary nav items with labels */}
          {primaryItems.slice(0, 4).map(item => {
            const Icon = item.icon;
            const active = isActive(item);

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={event => {
                  if (
                    event.button === 0 &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    onItemActivate?.(
                      item,
                      navigationInputMethodFromClick(event.detail)
                    );
                  }
                }}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors duration-subtle ease-subtle active:text-primary-token',
                  active
                    ? 'text-primary-token'
                    : 'text-tertiary-token hover:text-secondary-token'
                )}
              >
                <div className='relative'>
                  <Icon className='h-5 w-5' aria-hidden='true' />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className='absolute -top-1 -right-2'>
                      <Badge count={item.badge} size='sm' />
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    'sr-only',
                    active ? 'font-semibold' : 'font-caption'
                  )}
                >
                  {item.label}
                </span>
                {/* Active indicator dot */}
                {active && (
                  <div className='absolute -bottom-0.5 w-1 h-1 rounded-full bg-primary-token' />
                )}
              </Link>
            );
          })}

          {/* More menu toggle with label */}
          <button
            ref={moreButtonRef}
            type='button'
            onClick={toggleMenu}
            aria-label={isExpanded ? 'Close menu' : 'More options'}
            aria-expanded={isExpanded}
            aria-controls={expandedDialogId}
            className={cn(
              'relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors duration-subtle ease-subtle active:text-primary-token',
              isExpanded
                ? 'text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token'
            )}
          >
            <MoreHorizontal className='h-5 w-5' aria-hidden='true' />
            <span
              className={cn(
                'sr-only',
                isExpanded ? 'font-semibold' : 'font-caption'
              )}
            >
              More
            </span>
          </button>

          {/* Search button */}
          {onSearchClick && (
            <button
              type='button'
              onClick={onSearchClick}
              aria-label='Search'
              className='relative flex min-h-11 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-tertiary-token transition-colors duration-subtle ease-subtle hover:text-secondary-token active:text-primary-token'
            >
              <Search className='h-5 w-5' aria-hidden='true' />
              <span className='sr-only'>Search</span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
