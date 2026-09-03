export const RECOVERY_ACTIONS_SELECTOR = '[data-recovery-actions]' as const;
export const NESTED_INTERACTIVE_SELECTOR = 'a button, button a' as const;

export type RecoveryActionIssueCode = 'second-action' | 'nested-interactive';

export interface RecoveryActionInspection {
  readonly recoveryActionCount: number;
  readonly nestedInteractiveCount: number;
  readonly issues: readonly RecoveryActionIssueCode[];
}

function isRecoveryControl(element: Element): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.closest('details') || element.closest('summary')) {
    return false;
  }

  const tag = element.tagName.toLowerCase();
  return tag === 'button' || tag === 'a';
}

function isTopLevelRecoveryControl(
  element: Element,
  region: ParentNode
): boolean {
  if (!isRecoveryControl(element)) {
    return false;
  }

  const parentControl = element.parentElement?.closest('button, a[href]');
  return !(
    parentControl instanceof Element &&
    region.contains(parentControl) &&
    parentControl !== element
  );
}

/**
 * Inspect a recovery presenter for the one-action contract.
 * Production surfaces must return zero issues. Deliberate-red fixtures
 * exist so each failure code stays covered.
 */
export function inspectRecoveryActions(
  container: ParentNode
): RecoveryActionInspection {
  const region =
    container.querySelector(RECOVERY_ACTIONS_SELECTOR) ?? container;
  const nestedInteractiveCount = region.querySelectorAll(
    NESTED_INTERACTIVE_SELECTOR
  ).length;
  const recoveryActionCount = Array.from(
    region.querySelectorAll('button, a[href]')
  ).filter(element => isTopLevelRecoveryControl(element, region)).length;

  const issues: RecoveryActionIssueCode[] = [];
  if (recoveryActionCount !== 1) {
    issues.push('second-action');
  }
  if (nestedInteractiveCount > 0) {
    issues.push('nested-interactive');
  }

  return {
    recoveryActionCount,
    nestedInteractiveCount,
    issues,
  };
}

export function recoveryActionIssueCodes(
  inspection: RecoveryActionInspection
): readonly RecoveryActionIssueCode[] {
  return inspection.issues;
}
