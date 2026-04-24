/**
 * PlatformPill Utility Functions
 *
 * Extracted to reduce cognitive complexity of the main component.
 * Handles className computation and accessibility attributes.
 */

import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import type { PlatformPillState, PlatformPillTone } from './PlatformPill';

/**
 * Parameters for computing pill class names
 */
export interface PillClassNameParams {
  collapsed: boolean;
  defaultExpanded: boolean;
  stackable: boolean;
  isInteractive: boolean;
  tone: PlatformPillTone;
  state: PlatformPillState;
  className?: string;
}

/**
 * Base classes applied to all pills
 */
const BASE_CLASSES = [
  'group/pill relative min-w-0 border text-xs font-caption tracking-[-0.01em]',
  'border-(--pill-border) hover:border-(--pill-border-hover)',
  'bg-(--linear-app-content-surface) hover:bg-(--pill-bg-hover)',
  'text-secondary-token hover:text-primary-token',
  'transition-[background-color,border-color,color,grid-template-columns,max-width,opacity,padding,margin] duration-180 ease-out',
] as const;

/**
 * Classes for interactive pills
 */
const INTERACTIVE_CLASSES =
  'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0 active:bg-(--pill-bg-hover)';

/**
 * Classes for non-interactive pills
 */
const NON_INTERACTIVE_CLASSES = 'cursor-default';

/**
 * Get layout classes based on collapsed/expanded state
 */
function getLayoutClasses(
  collapsed: boolean,
  defaultExpanded: boolean
): string {
  if (collapsed) {
    return cn(
      'inline-grid max-w-[24px] grid-cols-[18px_0fr] items-center gap-0.5 overflow-hidden rounded-lg px-[3px] py-[3px]',
      !defaultExpanded &&
        'group-hover/pill:max-w-[132px] group-hover/pill:grid-cols-[18px_minmax(0,1fr)] group-focus-visible/pill:max-w-[132px] group-focus-visible/pill:grid-cols-[18px_minmax(0,1fr)] lg:group-hover/pill:max-w-[164px] lg:group-focus-visible/pill:max-w-[164px]',
      defaultExpanded &&
        'max-w-[132px] grid-cols-[18px_minmax(0,1fr)] lg:max-w-[164px]'
    );
  }
  return 'inline-flex min-h-[24px] max-w-full items-center gap-1.5 rounded-lg px-2 py-[3px]';
}

/**
 * Get stackable classes for avatar-style overlap
 */
function getStackableClasses(stackable: boolean): string {
  if (!stackable) return '';
  return '-ml-2 first:ml-0 last:z-10 hover:z-20';
}

/**
 * Get state-specific classes
 */
function getStateClasses(state: PlatformPillState): string {
  switch (state) {
    case 'hidden':
      return 'opacity-60';
    case 'loading':
      return 'animate-pulse motion-reduce:animate-none';
    default:
      return '';
  }
}

/**
 * Get tone-specific classes
 */
function getToneClasses(tone: PlatformPillTone): string {
  if (tone === 'faded') {
    return 'bg-(--linear-app-content-surface) text-secondary-token/85 hover:text-primary-token';
  }
  return '';
}

/**
 * Compute all class names for the pill wrapper
 */
export function getPillClassNames(params: PillClassNameParams): string {
  const {
    collapsed,
    defaultExpanded,
    stackable,
    isInteractive,
    tone,
    state,
    className,
  } = params;

  return cn(
    BASE_CLASSES,
    getLayoutClasses(collapsed, defaultExpanded),
    getStackableClasses(stackable),
    isInteractive ? INTERACTIVE_CLASSES : NON_INTERACTIVE_CLASSES,
    getToneClasses(tone),
    getStateClasses(state),
    className
  );
}

/**
 * Compute the title attribute for the pill
 */
export function getPillTitle(
  collapsed: boolean,
  platformName: string,
  primaryText: string
): string | undefined {
  if (!collapsed) return undefined;
  if (platformName === primaryText) return primaryText;
  return `${platformName}: ${primaryText}`;
}

/**
 * Compute accessibility props for interactive pills
 */
export function getPillA11yProps(
  isInteractive: boolean,
  collapsed: boolean,
  platformName: string,
  primaryText: string
): Pick<HTMLAttributes<HTMLDivElement>, 'role' | 'tabIndex' | 'aria-label'> {
  if (!isInteractive) {
    return {
      role: undefined,
      tabIndex: undefined,
      'aria-label': undefined,
    };
  }

  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': collapsed
      ? `${platformName}: ${primaryText}`
      : `Select ${platformName}`,
  };
}
