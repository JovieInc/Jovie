/**
 * Helper functions for DashboardOverview setup task styling.
 * Reduces cognitive complexity by extracting repeated conditional logic.
 */

const TASK_CONTAINER_BASE =
  'group flex items-center gap-2 rounded-full border border-transparent px-2.5 py-1 transition-[background-color,border-color,color] duration-100';
const TASK_INDICATOR_BASE =
  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-3xs font-semibold';
const TASK_LABEL_BASE =
  'text-[12.5px] leading-[15px] tracking-[-0.01em] text-primary-token';

/**
 * Get the container class for a completed setup task item.
 */
export function getCompletedTaskContainerClass(): string {
  return `${TASK_CONTAINER_BASE} bg-surface-0/75`;
}

/**
 * Get the container class for an incomplete setup task item.
 */
export function getIncompleteTaskContainerClass(): string {
  return `${TASK_CONTAINER_BASE} hover:border-(--linear-app-frame-seam) hover:bg-surface-0/60`;
}

/**
 * Get the indicator circle class for a completed setup task.
 */
export function getCompletedTaskIndicatorClass(): string {
  return `${TASK_INDICATOR_BASE} bg-emerald-500/14 text-emerald-500`;
}

/**
 * Get the indicator circle class for an incomplete setup task.
 */
export function getIncompleteTaskIndicatorClass(): string {
  return `${TASK_INDICATOR_BASE} border border-subtle bg-(--linear-app-content-surface) text-tertiary-token`;
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
