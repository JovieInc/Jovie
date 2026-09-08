'use client';

/**
 * Canonical bottom tab bar for the public profile compact surface.
 *
 * This is the single implementation of the profile bottom tab bar.
 * Visibility is driven by the route config's `showBottomTabBar` field —
 * callers decide whether to render this component based on that flag.
 * There is no `pathname.includes()` branching inside this file.
 *
 * Spec: docs/public-profile-surface-spec.md §2
 * Constants: apps/web/lib/profile/nav-constants.ts
 *
 * Destinations (JOV-6198 shared contract):
 *   1. Home   (mode: profile) — House icon
 *   2. Music  (mode: listen)  — Music2 icon
 *   3. Shows  (mode: tour)    — CalendarDays icon
 *   4. About  (mode: about)   — UserRound icon
 * Get updates is an action, not a destination. Presentation owns icons only.
 */

import {
  CalendarDays,
  House,
  type LucideIcon,
  Music2,
  UserRound,
} from 'lucide-react';
import { TAB_BAR_INTERNAL_SAFE_AREA_PADDING } from '@/lib/profile/nav-constants';
import {
  type BottomTabKey,
  getPermittedPublicProfileNavigation,
} from '@/lib/profile/route-config';
import { cn } from '@/lib/utils';
import type { ProfilePrimaryTab } from '../contracts';

const TAB_ICONS: Readonly<Record<BottomTabKey, LucideIcon>> = {
  profile: House,
  listen: Music2,
  tour: CalendarDays,
  about: UserRound,
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BottomTabBarProps {
  /**
   * Which destination is currently active.
   * Determines `aria-current="page"` and active colour on the tab button.
   */
  readonly activeTab: ProfilePrimaryTab;

  /**
   * Retained for API compatibility. Shows stays visible so Wave 1 can own
   * empty-vs-no-surface copy without compact hiding the destination.
   */
  readonly hasTourDates: boolean;

  /** Retained for API compatibility. Fan-capture gates the action, not dests. */
  readonly showAlerts?: boolean;

  /**
   * Whether the header menu is currently open.
   */
  readonly isMenuOpen?: boolean;

  /** Called when the user taps a primary destination. */
  readonly onTabSelect: (mode: ProfilePrimaryTab) => void;

  /** Retained for API compatibility. Does not invent or hide destinations. */
  readonly showAlertsTab?: boolean;

  /** Optional extra className applied to the outermost wrapper. */
  readonly className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Bottom tab bar for the public profile compact surface.
 *
 * Safe-area padding is applied inside the bar (`pb-[max(env(safe-area-inset-bottom),10px)]`).
 * Content rendered above this bar must reserve `--profile-bottom-nav-height`
 * — see `CONTENT_SAFE_AREA_BOTTOM_PADDING` in `lib/profile/nav-constants.ts`.
 *
 * The visible treatment stays compact. The full grid cell is interactive, so
 * touch geometry does not require a visible 44px button around every glyph.
 */
export function BottomTabBar({
  activeTab,
  hasTourDates: _hasTourDates,
  showAlerts: _showAlerts = true,
  isMenuOpen = false,
  onTabSelect,
  showAlertsTab: _showAlertsTab = true,
  className,
}: BottomTabBarProps) {
  const visibleTabs = getPermittedPublicProfileNavigation();
  const columnCount = visibleTabs.length;

  return (
    <div
      className={cn(
        'profile-floating-tab-bar shrink-0 pt-2',
        TAB_BAR_INTERNAL_SAFE_AREA_PADDING,
        className
      )}
      data-testid='profile-tab-bar'
    >
      <nav
        aria-label='Profile Navigation'
        data-testid='profile-bottom-nav'
        className='profile-liquid-glass-nav h-8 rounded-full border px-1 shadow-(--profile-dock-shadow) backdrop-blur-xl backdrop-saturate-150'
      >
        <div
          className='profile-liquid-glass-nav__grid -my-1.5 grid h-11 items-center gap-1'
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {visibleTabs.map(tab => {
            const Icon = TAB_ICONS[tab.id];
            // Active when the tab's mode matches and the menu is not open
            const isActive = !isMenuOpen && tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type='button'
                onClick={() => onTabSelect(tab.id)}
                className={cn(
                  'profile-liquid-glass-nav__item relative flex h-full min-w-0 touch-manipulation items-center justify-center rounded-full text-center transition-colors duration-subtle ease-subtle',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                  isActive
                    ? 'text-white dark:text-white'
                    : 'text-white/40 hover:text-white/62'
                )}
                // aria-current="page" marks the active tab for screen readers
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
              >
                <Icon
                  className={cn(
                    'profile-liquid-glass-nav__icon h-4 w-4 shrink-0 transition-[color,stroke-width] duration-subtle',
                    isActive ? 'text-white dark:text-white' : 'text-white/52'
                  )}
                  strokeWidth={isActive ? 2.35 : 1.8}
                  aria-hidden='true'
                />
                <span
                  className={cn(
                    'profile-liquid-glass-nav__label sr-only',
                    isActive ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
