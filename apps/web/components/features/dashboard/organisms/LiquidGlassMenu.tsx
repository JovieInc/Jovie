'use client';

import { LogOut, MoreHorizontal, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type ComponentType,
  type SVGProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  /** Optional admin items - shown in a separate section with header */
  readonly adminItems?: LiquidGlassMenuItem[];
  readonly onSearchClick?: () => void;
  readonly onSignOut?: () => void;
  readonly className?: string;
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
        rounded && 'rounded-[10px]'
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
      className={cn('absolute inset-0', rounded && 'rounded-[10px]')}
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
    size === 'sm'
      ? 'min-w-[16px] h-[16px] px-1 text-[9px]'
      : 'min-w-[24px] h-[20px] px-2 text-xs';

  return (
    <span
      className={cn(
        'flex items-center justify-center font-caption rounded-full bg-accent text-white',
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
}: {
  readonly item: LiquidGlassMenuItem;
  readonly active: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13px] font-caption transition-all duration-150',
        'active:scale-[0.98]',
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
  adminItems,
  onSearchClick,
  onSignOut,
  className,
}: LiquidGlassMenuProps): React.JSX.Element {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setIsExpanded(false), []);
  const toggleMenu = useCallback(() => setIsExpanded(prev => !prev), []);

  useCloseOnEscapeOrOutside(menuRef, isExpanded, closeMenu);

  // Close on route change
  useEffect(() => {
    setIsExpanded(false);
  }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const allMenuItems = [...primaryItems, ...expandedItems];
  const hasAdminItems = adminItems && adminItems.length > 0;

  return (
    <div
      ref={menuRef}
      className={cn('fixed bottom-0 inset-x-0 z-40 lg:hidden', className)}
    >
      {/* Expanded menu overlay */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-full transition-all duration-300 ease-out',
          isExpanded
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Backdrop */}
        <div
          className={cn(
            'fixed inset-0 z-50 bg-black/20 backdrop-blur-sm transition-opacity duration-300',
            isExpanded ? 'opacity-100' : 'opacity-0'
          )}
          onClick={closeMenu}
          aria-hidden='true'
        />

        {/* Expanded menu */}
        <div
          className={cn(
            'relative z-50 mx-3 mb-2 overflow-hidden rounded-[12px] transition-all duration-300 ease-out',
            isExpanded ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'
          )}
          style={{
            background: 'var(--liquid-glass-bg-solid)',
            boxShadow: 'var(--liquid-glass-shadow-elevated)',
            border: '1px solid var(--liquid-glass-border)',
          }}
        >
          <GlassHighlight />
          <GlassBlur intense />

          <nav
            className='relative z-10 py-2 max-h-[70svh] overflow-y-auto overscroll-contain'
            aria-label='Expanded navigation menu'
          >
            {/* Menu items */}
            <div className='px-2'>
              {allMenuItems.map(item => (
                <MenuItemLink
                  key={item.id}
                  item={item}
                  active={isActive(item.href)}
                />
              ))}

              {/* Admin section */}
              {hasAdminItems && (
                <>
                  <div className='my-2 mx-1 border-t border-default/30' />
                  <p className='px-3 py-1.5 text-[13px] font-caption tracking-normal text-secondary-token'>
                    Admin
                  </p>
                  {adminItems.map(item => (
                    <MenuItemLink
                      key={item.id}
                      item={item}
                      active={isActive(item.href)}
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
                    className='flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-[13px] font-caption text-secondary-token transition-all duration-150 hover:bg-surface-1 hover:text-primary-token active:scale-[0.98]'
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

      {/* Bottom tab bar */}
      <nav
        aria-label='Dashboard tabs'
        className='relative z-50'
        style={{
          background: 'var(--liquid-glass-bg-solid)',
          boxShadow: isExpanded ? 'none' : 'var(--liquid-glass-shadow)',
          borderTop: '1px solid var(--liquid-glass-border)',
        }}
      >
        <GlassHighlight subtle rounded={false} />
        <GlassBlur rounded={false} />

        <div className='relative z-10 flex items-stretch justify-around px-2 pb-[calc(env(safe-area-inset-bottom)+4px)] pt-1.5'>
          {/* Primary nav items with labels */}
          {primaryItems.slice(0, 4).map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[8px] py-1.5 transition-all duration-150',
                  'active:scale-95',
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
                    'text-3xs leading-tight',
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
            type='button'
            onClick={toggleMenu}
            aria-label={isExpanded ? 'Close menu' : 'More options'}
            aria-expanded={isExpanded}
            className={cn(
              'relative flex min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[8px] py-1.5 transition-all duration-150',
              'active:scale-95',
              isExpanded
                ? 'text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token'
            )}
          >
            <MoreHorizontal className='h-5 w-5' aria-hidden='true' />
            <span
              className={cn(
                'text-3xs leading-tight',
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
              className='relative flex min-w-[64px] flex-col items-center justify-center gap-0.5 rounded-[8px] py-1.5 text-tertiary-token transition-all duration-150 hover:text-secondary-token active:scale-95'
            >
              <Search className='h-5 w-5' aria-hidden='true' />
              <span className='text-3xs leading-tight font-caption'>
                Search
              </span>
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
