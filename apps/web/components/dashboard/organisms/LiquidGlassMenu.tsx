'use client';

import type { LucideIcon } from 'lucide-react';
import { MoreHorizontal, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type LiquidGlassMenuItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

export interface LiquidGlassMenuProps {
  readonly primaryItems: LiquidGlassMenuItem[];
  readonly expandedItems: LiquidGlassMenuItem[];
  /** Optional admin items - shown in a separate section with header */
  readonly adminItems?: LiquidGlassMenuItem[];
  readonly onSettingsClick?: () => void;
  readonly onSearchClick?: () => void;
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

function GlassHighlight({ subtle = false }: { subtle?: boolean }) {
  return (
    <div
      className='absolute inset-0 pointer-events-none rounded-2xl'
      style={
        subtle
          ? GLASS_LAYER_STYLES.highlightSubtle
          : GLASS_LAYER_STYLES.highlight
      }
      aria-hidden='true'
    />
  );
}

function GlassBlur({ intense = false }: { intense?: boolean }) {
  return (
    <div
      className='absolute inset-0 rounded-2xl'
      style={intense ? GLASS_LAYER_STYLES.blur : GLASS_LAYER_STYLES.blurLight}
      aria-hidden='true'
    />
  );
}

function Badge({ count, size = 'md' }: { count: number; size?: 'sm' | 'md' }) {
  if (count <= 0) return null;

  const sizeClasses =
    size === 'sm'
      ? 'min-w-[18px] h-[18px] px-1.5 text-[10px]'
      : 'min-w-[24px] h-[20px] px-2 text-xs';

  return (
    <span
      className={cn(
        'flex items-center justify-center font-semibold rounded-full bg-[#0ea5e9] text-white',
        sizeClasses
      )}
    >
      {formatBadge(count)}
    </span>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LiquidGlassMenu({
  primaryItems,
  expandedItems,
  adminItems,
  onSettingsClick,
  onSearchClick,
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
          'absolute inset-x-0 bottom-0 transition-all duration-300 ease-out',
          isExpanded
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        )}
      >
        {/* Backdrop */}
        <div
          className={cn(
            'fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300',
            isExpanded ? 'opacity-100' : 'opacity-0'
          )}
          onClick={closeMenu}
          aria-hidden='true'
        />

        {/* Expanded menu */}
        <div
          className={cn(
            'relative mx-4 mb-2 rounded-2xl overflow-hidden transition-all duration-300 ease-out',
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
            className='relative z-10 py-3'
            aria-label='Expanded navigation menu'
          >
            {/* Header with settings - workspace selector disabled until multi-workspace support */}
            {onSettingsClick && (
              <div className='flex items-center justify-end px-3 pb-2'>
                <button
                  type='button'
                  onClick={onSettingsClick}
                  aria-label='Settings'
                  className='flex items-center justify-center size-10 rounded-full bg-bg-surface-2/80 hover:bg-bg-surface-2 text-secondary-token hover:text-primary-token transition-colors'
                >
                  <Settings className='size-5' aria-hidden='true' />
                </button>
              </div>
            )}

            {/* Menu items - Linear compact style */}
            <div className='px-2'>
              {allMenuItems.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      'active:scale-[0.98]',
                      active
                        ? 'bg-bg-surface-2 text-primary-token'
                        : 'text-secondary-token hover:text-primary-token hover:bg-bg-surface-2/50'
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
              })}

              {/* Admin section - only visible when adminItems provided */}
              {hasAdminItems && (
                <>
                  <div className='my-2 mx-1 border-t border-default/30' />
                  <p className='px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-tertiary-token'>
                    Admin
                  </p>
                  {adminItems.map(item => {
                    const Icon = item.icon;
                    const active = isActive(item.href);

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                          'active:scale-[0.98]',
                          active
                            ? 'bg-bg-surface-2 text-primary-token'
                            : 'text-secondary-token hover:text-primary-token hover:bg-bg-surface-2/50'
                        )}
                      >
                        <Icon
                          className={cn(
                            'size-5 shrink-0',
                            active
                              ? 'text-primary-token'
                              : 'text-tertiary-token'
                          )}
                          aria-hidden='true'
                        />
                        <span className='flex-1'>{item.label}</span>
                        {item.badge !== undefined && (
                          <Badge count={item.badge} />
                        )}
                      </Link>
                    );
                  })}
                </>
              )}
            </div>
          </nav>
        </div>
      </div>

      {/* Bottom tab bar */}
      <nav
        aria-label='Dashboard tabs'
        className='relative'
        style={{
          background: 'var(--liquid-glass-bg-solid)',
          boxShadow: isExpanded ? 'none' : 'var(--liquid-glass-shadow)',
          borderTop: '1px solid var(--liquid-glass-border)',
        }}
      >
        <GlassHighlight subtle />
        <GlassBlur />

        <div className='relative z-10 flex items-center justify-between px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2'>
          {/* Primary nav items */}
          <div className='flex items-center gap-1'>
            {primaryItems.slice(0, 4).map(item => {
              const Icon = item.icon;
              const active = isActive(item.href);

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative flex items-center justify-center size-11 rounded-xl transition-all duration-150',
                    'active:scale-95',
                    active
                      ? 'bg-bg-surface-2 text-primary-token'
                      : 'text-tertiary-token hover:text-secondary-token'
                  )}
                >
                  <Icon className='size-5' aria-hidden='true' />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className='absolute -top-0.5 -right-0.5'>
                      <Badge count={item.badge} size='sm' />
                    </span>
                  )}
                </Link>
              );
            })}

            {/* More menu toggle - Linear style */}
            <button
              type='button'
              onClick={toggleMenu}
              aria-label={isExpanded ? 'Close menu' : 'More options'}
              aria-expanded={isExpanded}
              className={cn(
                'relative flex items-center justify-center size-11 rounded-xl transition-all duration-150',
                'active:scale-95',
                isExpanded
                  ? 'bg-bg-surface-2 text-primary-token'
                  : 'text-tertiary-token hover:text-secondary-token'
              )}
            >
              <MoreHorizontal className='size-5' aria-hidden='true' />
            </button>
          </div>

          {/* Search button - Linear floating style */}
          {onSearchClick && (
            <button
              type='button'
              onClick={onSearchClick}
              aria-label='Search'
              className='flex items-center justify-center size-12 rounded-full bg-bg-surface-2 text-primary-token transition-all duration-150 active:scale-95 shadow-sm'
            >
              <Search className='size-5' aria-hidden='true' />
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
