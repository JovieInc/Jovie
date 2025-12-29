'use client';

/**
 * Breakpoint hooks with Tailwind CSS preset values.
 * Reduces duplicated useMediaQuery patterns across components.
 */

import { useMemo } from 'react';
import { useMediaQuery } from './useMediaQuery';

/**
 * Tailwind CSS default breakpoints.
 * @see https://tailwindcss.com/docs/responsive-design
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Check if viewport is at or above a breakpoint.
 *
 * @example
 * ```tsx
 * const isDesktop = useBreakpoint('lg');
 * const isTablet = useBreakpoint('md');
 *
 * return isDesktop ? <DesktopNav /> : <MobileNav />;
 * ```
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const query = `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
  return useMediaQuery(query);
}

/**
 * Check if viewport is below a breakpoint.
 *
 * @example
 * ```tsx
 * const isMobile = useBreakpointDown('md'); // < 768px
 * ```
 */
export function useBreakpointDown(breakpoint: Breakpoint): boolean {
  const query = `(max-width: ${BREAKPOINTS[breakpoint] - 1}px)`;
  return useMediaQuery(query);
}

/**
 * Check if viewport is between two breakpoints.
 *
 * @example
 * ```tsx
 * const isTabletOnly = useBreakpointBetween('md', 'lg'); // 768px - 1023px
 * ```
 */
export function useBreakpointBetween(
  min: Breakpoint,
  max: Breakpoint
): boolean {
  const query = `(min-width: ${BREAKPOINTS[min]}px) and (max-width: ${BREAKPOINTS[max] - 1}px)`;
  return useMediaQuery(query);
}

export interface BreakpointState {
  /** Is extra small (< 640px) */
  isXs: boolean;
  /** Is small or above (>= 640px) */
  isSm: boolean;
  /** Is medium or above (>= 768px) */
  isMd: boolean;
  /** Is large or above (>= 1024px) */
  isLg: boolean;
  /** Is extra large or above (>= 1280px) */
  isXl: boolean;
  /** Is 2xl or above (>= 1536px) */
  is2xl: boolean;
  /** Is mobile (< 768px) - common pattern */
  isMobile: boolean;
  /** Is tablet (768px - 1023px) */
  isTablet: boolean;
  /** Is desktop (>= 1024px) */
  isDesktop: boolean;
  /** Current active breakpoint */
  current: 'xs' | Breakpoint;
}

/**
 * Get all breakpoint states at once.
 * More efficient than multiple useBreakpoint calls.
 *
 * @example
 * ```tsx
 * const { isMobile, isDesktop, current } = useBreakpoints();
 *
 * return (
 *   <div>
 *     {isMobile && <MobileMenu />}
 *     {isDesktop && <DesktopSidebar />}
 *     <span>Current breakpoint: {current}</span>
 *   </div>
 * );
 * ```
 */
export function useBreakpoints(): BreakpointState {
  const isSm = useMediaQuery(`(min-width: ${BREAKPOINTS.sm}px)`);
  const isMd = useMediaQuery(`(min-width: ${BREAKPOINTS.md}px)`);
  const isLg = useMediaQuery(`(min-width: ${BREAKPOINTS.lg}px)`);
  const isXl = useMediaQuery(`(min-width: ${BREAKPOINTS.xl}px)`);
  const is2xl = useMediaQuery(`(min-width: ${BREAKPOINTS['2xl']}px)`);

  const state = useMemo(() => {
    const isXs = !isSm;
    const isMobile = !isMd;
    const isTablet = isMd && !isLg;
    const isDesktop = isLg;

    let current: 'xs' | Breakpoint = 'xs';
    if (is2xl) current = '2xl';
    else if (isXl) current = 'xl';
    else if (isLg) current = 'lg';
    else if (isMd) current = 'md';
    else if (isSm) current = 'sm';

    return {
      isXs,
      isSm,
      isMd,
      isLg,
      isXl,
      is2xl,
      isMobile,
      isTablet,
      isDesktop,
      current,
    };
  }, [isSm, isMd, isLg, isXl, is2xl]);

  return state;
}

/**
 * Get responsive value based on current breakpoint.
 *
 * @example
 * ```tsx
 * const columns = useResponsiveValue({
 *   xs: 1,
 *   sm: 2,
 *   md: 3,
 *   lg: 4,
 * });
 *
 * return <Grid columns={columns}>...</Grid>;
 * ```
 */
export function useResponsiveValue<T>(
  values: Partial<Record<'xs' | Breakpoint, T>>
): T | undefined {
  const { current } = useBreakpoints();

  return useMemo(() => {
    // Try to find value for current or smaller breakpoints
    const breakpointOrder: ('xs' | Breakpoint)[] = [
      '2xl',
      'xl',
      'lg',
      'md',
      'sm',
      'xs',
    ];
    const currentIndex = breakpointOrder.indexOf(current);

    for (let i = currentIndex; i < breakpointOrder.length; i++) {
      const bp = breakpointOrder[i];
      if (bp && values[bp] !== undefined) {
        return values[bp];
      }
    }

    return undefined;
  }, [current, values]);
}
