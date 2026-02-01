'use client';

import type { LucideIcon } from 'lucide-react';
import { ChevronUp, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils';

/**
 * Menu item configuration
 */
export type LiquidGlassMenuItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

/**
 * Props for the LiquidGlassMenu component
 */
export interface LiquidGlassMenuProps {
  /** Menu items to display in the tab bar */
  readonly primaryItems: LiquidGlassMenuItem[];
  /** Additional items shown in the expanded menu */
  readonly expandedItems: LiquidGlassMenuItem[];
  /** Optional workspace/profile selector content */
  readonly workspaceSelector?: ReactNode;
  /** Optional settings button handler */
  readonly onSettingsClick?: () => void;
  /** Optional search button handler */
  readonly onSearchClick?: () => void;
  /** Additional CSS classes */
  readonly className?: string;
}

/**
 * LiquidGlassMenu - An expandable mobile navigation with frosted glass effect
 *
 * Inspired by Linear's liquid glass design:
 * - Frosted glass aesthetic with backdrop blur
 * - Smooth expand/collapse animations
 * - Touch feedback with subtle lift effect
 * - Specular highlights for depth
 */
export function LiquidGlassMenu({
  primaryItems,
  expandedItems,
  workspaceSelector,
  onSettingsClick,
  onSearchClick,
  className,
}: LiquidGlassMenuProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const expandedMenuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    // Add listener with a small delay to prevent immediate close on open
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 10);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  // Close menu on route change
  useEffect(() => {
    setIsExpanded(false);
  }, [pathname]);

  // Handle escape key
  useEffect(() => {
    if (!isExpanded) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  const toggleExpanded = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // All items for the expanded menu
  const allMenuItems = [...primaryItems, ...expandedItems];

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
        style={
          {
            '--menu-height': isExpanded ? 'auto' : '0px',
          } as CSSProperties
        }
      >
        {/* Backdrop blur overlay for content behind */}
        <div
          className={cn(
            'fixed inset-0 bg-black/20 backdrop-blur-sm transition-opacity duration-300',
            isExpanded ? 'opacity-100' : 'opacity-0'
          )}
          onClick={() => setIsExpanded(false)}
          aria-hidden='true'
        />

        {/* Expanded menu container */}
        <div
          ref={expandedMenuRef}
          className={cn(
            'relative mx-4 mb-2 rounded-2xl overflow-hidden transition-all duration-300 ease-out transform',
            isExpanded ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'
          )}
          style={{
            background: 'var(--liquid-glass-bg-solid)',
            boxShadow: 'var(--liquid-glass-shadow-elevated)',
            border: '1px solid var(--liquid-glass-border)',
          }}
        >
          {/* Specular highlight overlay */}
          <div
            className='absolute inset-0 pointer-events-none rounded-2xl'
            style={{
              background: 'var(--liquid-glass-highlight)',
              mixBlendMode: 'plus-lighter',
              opacity: 0.5,
            }}
            aria-hidden='true'
          />

          {/* Backdrop blur layer */}
          <div
            className='absolute inset-0 backdrop-blur-xl rounded-2xl'
            style={{
              backdropFilter: `blur(var(--liquid-glass-blur-intense))`,
              WebkitBackdropFilter: `blur(var(--liquid-glass-blur-intense))`,
            }}
            aria-hidden='true'
          />

          {/* Menu content */}
          <nav
            className='relative z-10 py-2'
            aria-label='Expanded navigation menu'
          >
            {/* Workspace selector if provided */}
            {workspaceSelector && (
              <div className='px-3 pb-2 mb-1 border-b border-default/50'>
                {workspaceSelector}
              </div>
            )}

            {/* Menu items */}
            <div className='space-y-0.5 px-2'>
              {allMenuItems.map(item => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                      'active:scale-[0.98] active:translate-y-px',
                      active
                        ? 'text-primary-token'
                        : 'text-secondary-token hover:text-primary-token'
                    )}
                    style={{
                      background: active
                        ? 'var(--liquid-glass-item-selected)'
                        : undefined,
                    }}
                    onMouseEnter={e => {
                      if (!active) {
                        e.currentTarget.style.background =
                          'var(--liquid-glass-item-hover)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!active) {
                        e.currentTarget.style.background = 'transparent';
                      }
                    }}
                  >
                    <span
                      className={cn(
                        'flex items-center justify-center size-8 rounded-lg transition-colors',
                        active
                          ? 'bg-color-accent/15 text-color-accent'
                          : 'bg-sidebar-accent/50 text-tertiary-token'
                      )}
                    >
                      <Icon className='size-[18px]' aria-hidden='true' />
                    </span>
                    <span className='flex-1'>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className='flex items-center justify-center min-w-[22px] h-[22px] px-1.5 text-xs font-semibold rounded-full bg-color-accent text-color-accent-foreground'>
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
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
        {/* Specular highlight for tab bar */}
        <div
          className='absolute inset-0 pointer-events-none'
          style={{
            background: 'var(--liquid-glass-highlight)',
            mixBlendMode: 'plus-lighter',
            opacity: 0.3,
          }}
          aria-hidden='true'
        />

        {/* Backdrop blur for tab bar */}
        <div
          className='absolute inset-0'
          style={{
            backdropFilter: `blur(var(--liquid-glass-blur))`,
            WebkitBackdropFilter: `blur(var(--liquid-glass-blur))`,
          }}
          aria-hidden='true'
        />

        <div className='relative z-10 flex items-center justify-around px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2'>
          {/* Primary tab items */}
          {primaryItems.slice(0, 4).map(item => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center p-2 rounded-xl min-w-[56px] transition-all duration-150',
                  'active:scale-95 active:translate-y-px',
                  active ? 'text-primary-token' : 'text-tertiary-token'
                )}
                style={{
                  background: active
                    ? 'var(--liquid-glass-item-selected)'
                    : undefined,
                }}
              >
                <span
                  className={cn(
                    'flex items-center justify-center size-7 rounded-lg transition-colors',
                    active && 'text-color-accent'
                  )}
                >
                  <Icon className='size-5' aria-hidden='true' />
                </span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className='absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold rounded-full bg-color-accent text-color-accent-foreground'>
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Expand/collapse button */}
          <button
            type='button'
            onClick={toggleExpanded}
            aria-label={isExpanded ? 'Collapse menu' : 'Expand menu'}
            aria-expanded={isExpanded}
            className={cn(
              'relative flex flex-col items-center justify-center p-2 rounded-xl min-w-[56px] transition-all duration-150',
              'active:scale-95 active:translate-y-px',
              isExpanded
                ? 'text-primary-token'
                : 'text-tertiary-token hover:text-secondary-token'
            )}
            style={{
              background: isExpanded
                ? 'var(--liquid-glass-item-selected)'
                : undefined,
            }}
          >
            <span className='flex items-center justify-center size-7 rounded-lg'>
              <ChevronUp
                className={cn(
                  'size-5 transition-transform duration-300',
                  isExpanded && 'rotate-180'
                )}
                aria-hidden='true'
              />
            </span>
          </button>

          {/* Optional action buttons */}
          {onSettingsClick && (
            <button
              type='button'
              onClick={onSettingsClick}
              aria-label='Settings'
              className='flex flex-col items-center justify-center p-2 rounded-xl min-w-[48px] text-tertiary-token hover:text-secondary-token transition-all duration-150 active:scale-95 active:translate-y-px'
            >
              <span className='flex items-center justify-center size-7 rounded-lg'>
                <Settings className='size-5' aria-hidden='true' />
              </span>
            </button>
          )}

          {onSearchClick && (
            <button
              type='button'
              onClick={onSearchClick}
              aria-label='Search'
              className='flex flex-col items-center justify-center p-3 rounded-full min-w-[48px] text-primary-token transition-all duration-150 active:scale-95 active:translate-y-px'
              style={{
                background: 'var(--liquid-glass-item-selected)',
              }}
            >
              <Search className='size-5' aria-hidden='true' />
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
