/**
 * Helper functions for DashboardOverview setup task styling.
 * Reduces cognitive complexity by extracting repeated conditional logic.
 */

const TASK_CONTAINER_BASE =
  'group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors';
const TASK_INDICATOR_BASE =
  'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px]';
const TASK_LABEL_BASE = 'text-[13px]';

/**
 * Get the container class for a completed setup task item.
 */
export function getCompletedTaskContainerClass(): string {
  return TASK_CONTAINER_BASE;
}

/**
 * Get the container class for an incomplete setup task item.
 */
export function getIncompleteTaskContainerClass(): string {
  return `${TASK_CONTAINER_BASE} hover:bg-surface-1`;
}

/**
 * Get the indicator circle class for a completed setup task.
 */
export function getCompletedTaskIndicatorClass(): string {
  return `${TASK_INDICATOR_BASE} bg-success/10 text-success`;
}

/**
 * Get the indicator circle class for an incomplete setup task.
 */
export function getIncompleteTaskIndicatorClass(): string {
  return `${TASK_INDICATOR_BASE} border border-subtle text-tertiary-token`;
}

/**
 * Get the task label text class for a completed task.
 */
export function getCompletedTaskLabelClass(): string {
  return `${TASK_LABEL_BASE} text-tertiary-token line-through decoration-tertiary-token/40`;
}

/**
 * Get the task label text class for an incomplete task.
 */
export function getIncompleteTaskLabelClass(): string {
  return `${TASK_LABEL_BASE} text-primary-token`;
}

/**
 * Get the indicator content for a completed task.
 */
export function getCompletedTaskIndicatorContent(): string {
  return '✓';
}

/**
 * Get the indicator content for an incomplete task.
 */
export function getIncompleteTaskIndicatorContent(stepNumber: number): string {
  return String(stepNumber);
}
