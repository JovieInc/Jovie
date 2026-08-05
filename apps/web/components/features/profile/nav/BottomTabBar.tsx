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
 *   1. Home     (mode: profile)   — UserRound icon
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
  // UserRound = profile home (not a separate "person" destination).
  { mode: 'profile', label: 'Home', icon: UserRound },
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

  /** Whether the artist has an ownership-safe fan-capture surface. */
  readonly showAlerts?: boolean;

  /**
   * Whether the header menu is currently open.
   */
  readonly isMenuOpen?: boolean;

  /** Called when the user taps a primary tab. */
  readonly onTabSelect: (mode: ProfilePrimaryTab) => void;

  /** Whether the Alerts destination is available for this profile. */
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
  showAlerts = true,
  isMenuOpen = false,
  onTabSelect,
  showAlertsTab = true,
  className,
}: BottomTabBarProps) {
  const visibleTabs =
    showAlerts && showAlertsTab
      ? ALL_PRIMARY_TABS
      : ALL_PRIMARY_TABS.filter(tab => tab.mode !== 'subscribe');
  const columnCount = visibleTabs.length;

  return (
    <div
      className={cn(
        'shrink-0 pb-[max(env(safe-area-inset-bottom),10px)] pt-2',
        className
      )}
      data-testid='profile-tab-bar'
    >
      <nav
        aria-label='Profile Navigation'
        data-testid='profile-bottom-nav'
        className='h-12 rounded-full border border-[color:var(--profile-dock-border)] bg-[color:var(--profile-dock-bg)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur-2xl'
      >
        <div
          className='-my-0.5 grid h-11 items-center gap-1'
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
                className={cn(
                  'relative flex h-full min-w-0 touch-manipulation items-center justify-center rounded-full text-center transition-colors duration-subtle ease-subtle',
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
                    'h-5 w-5 shrink-0 transition-[color,stroke-width] duration-subtle',
                    isActive ? 'text-white dark:text-white' : 'text-white/52'
                  )}
                  strokeWidth={isActive ? 2.35 : 1.8}
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
