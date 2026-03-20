/**
 * Helper functions for DashboardOverview setup task styling.
 * Reduces cognitive complexity by extracting repeated conditional logic.
 */

const TASK_CONTAINER_BASE =
  'group flex items-center gap-1.5 rounded-md px-1.5 py-px transition-[background-color,border-color] duration-100';
const TASK_INDICATOR_BASE =
  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-[560]';
const TASK_LABEL_BASE =
  'text-[12.5px] leading-[15px] tracking-[-0.01em] text-primary-token';

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
  return `${TASK_CONTAINER_BASE} hover:bg-surface-0/60`;
}

/**
 * Get the indicator circle class for a completed setup task.
 */
export function getCompletedTaskIndicatorClass(): string {
  return `${TASK_INDICATOR_BASE} bg-emerald-500/12 text-emerald-500`;
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
  return `${TASK_LABEL_BASE} text-tertiary-token line-through decoration-(--linear-text-tertiary)/40`;
}

/**
 * Get the task label text class for an incomplete task.
 */
export function getIncompleteTaskLabelClass(): string {
  return TASK_LABEL_BASE;
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
