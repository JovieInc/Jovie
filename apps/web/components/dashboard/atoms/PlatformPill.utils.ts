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
  'group/pill relative inline-flex items-center rounded-full border text-xs font-medium',
  'border-(--pill-border) hover:border-(--pill-border-hover)',
  'bg-surface-1 hover:bg-(--pill-bg-hover) dark:bg-surface-1/60 dark:hover:bg-(--pill-bg-hover) dark:backdrop-blur-sm',
  'text-secondary-token hover:text-primary-token',
  'transition-all duration-200',
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
      'h-7 justify-center px-2',
      !defaultExpanded && 'w-7 p-0',
      defaultExpanded && 'w-auto gap-1'
    );
  }
  return 'max-w-full gap-1.5 px-2 py-[3px] min-h-[24px]';
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
    return 'bg-surface-1/60 text-secondary-token/85 hover:text-primary-token';
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
