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
 *   3. Events (mode: tour)    — CalendarDays icon
 *   4. About  (mode: about)   — UserRound icon
 * Get updates is an action, not a destination. Presentation owns icons only.
 *
 * Liquid glass (Tim direction 2026-09-26, after Linear's disciplined take):
 * the bar owns the single backdrop-filter; one shared "lens" indicator slides
 * between tabs on a spring and stretches slightly along the travel axis. The
 * lens animates transform only, driven by motion values (no React re-render
 * and no layout reads per frame). Press feedback is CSS-only (:active on the
 * full hit cell compresses the glyph, released on a linear() spring), so it
 * works for touch and pointer without JS. Reduced motion snaps and never
 * scales. This glyph press is a deliberate founder exception to the ui.md
 * "tabs must not scale" default: the 44px hit cell itself never scales.
 */

import {
  CalendarDays,
  House,
  type LucideIcon,
  Music2,
  UserRound,
} from 'lucide-react';
import { motion, useSpring, useTransform, useVelocity } from 'motion/react';
import { useEffect, useRef } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
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

/**
 * Lens travel spring. Damping ratio ~0.8: quick, a hint of overshoot, no
 * visible wobble. Units are % of one column, so the lens position never
 * depends on measured pixels.
 */
export const LENS_SPRING = Object.freeze({
  stiffness: 500,
  damping: 34,
  mass: 0.9,
});

/**
 * Velocity (column-% per second) at which the lens reaches its maximum
 * stretch. A one-tab hop peaks around a third of this, so short moves stay
 * almost round and long moves read as liquid.
 */
const LENS_STRETCH_VELOCITY = 2400;
const LENS_MAX_STRETCH_X = 1.14;
const LENS_MIN_SQUASH_Y = 0.92;

// ---------------------------------------------------------------------------
// Lens indicator
// ---------------------------------------------------------------------------

interface LiquidGlassLensProps {
  readonly activeIndex: number;
  readonly columnCount: number;
  readonly reducedMotion: boolean;
}

function LiquidGlassLens({
  activeIndex,
  columnCount,
  reducedMotion,
}: LiquidGlassLensProps) {
  const isVisible = activeIndex >= 0;
  const wasVisible = useRef(isVisible);

  // useSpring only reads its initial value on mount; later moves go through
  // set/jump in the effect below.
  const position = useSpring(Math.max(activeIndex, 0) * 100, LENS_SPRING);
  const velocity = useVelocity(position);
  const x = useTransform(position, value => `${value}%`);
  const scaleX = useTransform(
    velocity,
    [-LENS_STRETCH_VELOCITY, 0, LENS_STRETCH_VELOCITY],
    [LENS_MAX_STRETCH_X, 1, LENS_MAX_STRETCH_X]
  );
  const scaleY = useTransform(
    velocity,
    [-LENS_STRETCH_VELOCITY, 0, LENS_STRETCH_VELOCITY],
    [LENS_MIN_SQUASH_Y, 1, LENS_MIN_SQUASH_Y]
  );

  useEffect(() => {
    if (!isVisible) {
      wasVisible.current = false;
      return;
    }
    const target = activeIndex * 100;
    // Snap when motion is reduced, and when the lens reappears (menu closed)
    // so it never slides in from a stale, invisible position.
    if (reducedMotion || !wasVisible.current) {
      position.jump(target);
    } else {
      position.set(target);
    }
    wasVisible.current = true;
  }, [activeIndex, isVisible, position, reducedMotion]);

  return (
    <motion.span
      aria-hidden='true'
      className='profile-liquid-glass-nav__lens'
      data-testid='profile-bottom-nav-indicator'
      data-active-index={isVisible ? activeIndex : undefined}
      data-visible={isVisible ? 'true' : 'false'}
      style={{
        width: `${100 / columnCount}%`,
        x,
        scaleX: reducedMotion ? 1 : scaleX,
        scaleY: reducedMotion ? 1 : scaleY,
      }}
    />
  );
}

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
   * Retained for API compatibility. Events stays visible so Wave 1 can own
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
  const reducedMotion = useReducedMotion();
  const activeIndex = isMenuOpen
    ? -1
    : visibleTabs.findIndex(tab => tab.id === activeTab);

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
        className='profile-liquid-glass-nav h-8 rounded-full border px-1'
      >
        <div
          className='profile-liquid-glass-nav__grid relative -my-1.5 grid h-11 items-center'
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          <LiquidGlassLens
            activeIndex={activeIndex}
            columnCount={columnCount}
            reducedMotion={reducedMotion}
          />
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
                <span
                  className={cn(
                    'profile-liquid-glass-nav__label sr-only',
                    isActive ? 'font-semibold' : 'font-medium'
                  )}
                >
                  {tab.label}
                </span>
                <span
                  className='profile-liquid-glass-nav__glyph'
                  aria-hidden='true'
                >
                  <Icon
                    className={cn(
                      'profile-liquid-glass-nav__icon h-4 w-4 shrink-0 transition-[color,stroke-width] duration-subtle',
                      isActive ? 'text-white dark:text-white' : 'text-white/52'
                    )}
                    strokeWidth={isActive ? 2.35 : 1.8}
                    aria-hidden='true'
                  />
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
