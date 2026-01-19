/**
 * Helper functions for DashboardOverview setup task styling.
 * Reduces cognitive complexity by extracting repeated conditional logic.
 */

/**
 * Get the container class for a setup task item.
 */
export function getTaskContainerClass(isComplete: boolean): string {
  const base =
    'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors';
  return isComplete ? base : `${base} hover:bg-surface-1`;
}

/**
 * Get the indicator circle class for a setup task.
 */
export function getTaskIndicatorClass(isComplete: boolean): string {
  const base =
    'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px]';
  return isComplete
    ? `${base} bg-green-500/10 text-green-600 dark:bg-green-500/15 dark:text-green-400`
    : `${base} border border-subtle text-tertiary-token`;
}

/**
 * Get the task label text class.
 */
export function getTaskLabelClass(isComplete: boolean): string {
  const base = 'text-[13px]';
  return isComplete
    ? `${base} text-tertiary-token line-through decoration-tertiary-token/40`
    : `${base} text-primary-token`;
}

/**
 * Get the indicator content (checkmark or number).
 */
export function getTaskIndicatorContent(
  isComplete: boolean,
  stepNumber: number
): string {
  return isComplete ? '✓' : String(stepNumber);
}
