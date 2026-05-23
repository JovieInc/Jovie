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
 * Tab definitions (spec §2.1, fixed order):
 *   1. Profile  (mode: profile)   — UserRound icon
 *   2. Music    (mode: listen)    — Music2 icon
 *   3. Events   (mode: tour)      — CalendarDays icon
 *   4. Alerts   (mode: subscribe) — Bell icon
 * Desktop / tablet behaviour: the public profile shell may center this
 * compact experience on larger screens, so the tab bar remains canonical.
 */

import {
  Bell,
  CalendarDays,
  type LucideIcon,
  Music2,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProfilePrimaryTab } from '../contracts';

// ---------------------------------------------------------------------------
// Tab definitions — fixed order per spec §2.1
// ---------------------------------------------------------------------------

interface TabDefinition {
  readonly mode: ProfilePrimaryTab;
  readonly label: string;
  readonly icon: LucideIcon;
}

/**
 * All four primary tab definitions, in canonical order.
 */
const ALL_PRIMARY_TABS: ReadonlyArray<TabDefinition> = [
  { mode: 'profile', label: 'Profile', icon: UserRound },
  { mode: 'listen', label: 'Music', icon: Music2 },
  { mode: 'tour', label: 'Events', icon: CalendarDays },
  { mode: 'subscribe', label: 'Alerts', icon: Bell },
] as const;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BottomTabBarProps {
  /**
   * Which primary tab is currently active.
   * Determines `aria-current="page"` and active colour on the tab button.
   */
  readonly activeTab: ProfilePrimaryTab;

  /**
   * Retained for API compatibility; Events now remains visible so the tab can
   * show a native empty state when no upcoming dates exist.
   */
  readonly hasTourDates: boolean;

  /**
   * Retained for API compatibility. More now lives in the profile header.
   */
  readonly hideMoreMenu?: boolean;

  /**
   * Whether the header menu is currently open.
   */
  readonly isMenuOpen?: boolean;

  /** Called when the user taps a primary tab. */
  readonly onTabSelect: (mode: ProfilePrimaryTab) => void;

  /** Retained for API compatibility. */
  readonly onOpenMenu: () => void;

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
 * Touch targets meet the 44×44pt minimum via `min-h-[50px]` on each button.
 */
export function BottomTabBar({
  activeTab,
  hasTourDates: _hasTourDates,
  isMenuOpen = false,
  onTabSelect,
  className,
}: BottomTabBarProps) {
  const visibleTabs = ALL_PRIMARY_TABS;
  const columnCount = visibleTabs.length;

  return (
    <div
      className={cn(
        '-mx-[var(--page-pad)] shrink-0 border-t border-[color:var(--profile-dock-border)] bg-[color:var(--profile-dock-bg)] px-1.5 pb-[max(env(safe-area-inset-bottom),10px)] pt-1 backdrop-blur-2xl',
        className
      )}
      data-testid='profile-tab-bar'
    >
      <nav aria-label='Profile navigation' data-testid='profile-bottom-nav'>
        <div
          className='grid items-center gap-1'
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {visibleTabs.map(tab => {
            const Icon = tab.icon;
            // Active when the tab's mode matches and the menu is not open
            const isActive = !isMenuOpen && tab.mode === activeTab;

            return (
              <button
                key={tab.mode}
                type='button'
                onClick={() => onTabSelect(tab.mode)}
                // 44×44pt minimum touch target (spec §2 a11y requirement).
                className={cn(
                  'relative flex min-h-[50px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[var(--profile-action-radius)] px-1.5 py-1.5 text-center transition-[background-color,color] duration-subtle',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--focus-ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                  isActive ? 'text-white' : 'text-white/40 hover:text-white/62'
                )}
                // aria-current="page" marks the active tab for screen readers
                aria-current={isActive ? 'page' : undefined}
                aria-label={tab.label}
              >
                <Icon
                  className={cn(
                    'h-[21px] w-[21px] shrink-0',
                    isActive ? 'text-white' : 'text-white/52'
                  )}
                  aria-hidden='true'
                />
                <span
                  className={cn(
                    'sr-only',
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
