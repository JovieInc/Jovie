export const LOADING_OWNER_SELECTOR =
  '[role="status"][aria-busy="true"]' as const;

export type LoadingOwnerIssueCode =
  | 'missing-owner'
  | 'duplicate-owners'
  | 'missing-accessible-name'
  | 'missing-polite-live'
  | 'competing-descendant'
  | 'raw-skeleton';

export interface LoadingOwnerIssue {
  readonly code: LoadingOwnerIssueCode;
  readonly detail: string;
}

export interface LoadingOwnerInspection {
  readonly owners: readonly HTMLElement[];
  readonly issues: readonly LoadingOwnerIssue[];
}

function isElement(node: EventTarget | null): node is HTMLElement {
  return node instanceof HTMLElement;
}

function classTokens(element: Element): readonly string[] {
  return Array.from(element.classList);
}

function hasAccessibleName(owner: HTMLElement): boolean {
  if ((owner.getAttribute('aria-label') ?? '').trim().length > 0) {
    return true;
  }

  const labelledBy = owner.getAttribute('aria-labelledby')?.trim();
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    return ids.some(id => {
      const label = owner.ownerDocument.getElementById(id);
      return Boolean(label?.textContent?.trim());
    });
  }

  const visibleText = Array.from(owner.querySelectorAll('*'))
    .concat(owner)
    .filter(isElement)
    .filter(element => element.getAttribute('aria-hidden') !== 'true')
    .some(element => {
      const text = Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent ?? '')
        .join('')
        .trim();
      return text.length > 0;
    });

  return visibleText;
}

function isCanonicalSkeleton(element: Element): boolean {
  return (
    classTokens(element).includes('skeleton') &&
    element.getAttribute('aria-hidden') === 'true' &&
    element.hasAttribute('data-state')
  );
}

function isRawSkeleton(element: Element): boolean {
  return (
    classTokens(element).includes('skeleton') && !isCanonicalSkeleton(element)
  );
}

/**
 * Inspect a rendered loading surface for the single-owner contract.
 * Production surfaces must return zero issues. Deliberate-red fixtures
 * exist so each failure code stays covered.
 */
export function inspectLoadingOwners(
  container: ParentNode
): LoadingOwnerInspection {
  const owners = Array.from(
    container.querySelectorAll<HTMLElement>(LOADING_OWNER_SELECTOR)
  );
  const issues: LoadingOwnerIssue[] = [];

  if (owners.length === 0) {
    issues.push({
      code: 'missing-owner',
      detail: 'Rendered surface has no role=status aria-busy=true owner',
    });
  }

  if (owners.length > 1) {
    issues.push({
      code: 'duplicate-owners',
      detail: `Rendered surface has ${owners.length} loading owners`,
    });
  }

  for (const owner of owners) {
    if (!hasAccessibleName(owner)) {
      issues.push({
        code: 'missing-accessible-name',
        detail: 'Loading owner is missing an accessible name',
      });
    }

    if ((owner.getAttribute('aria-live') ?? '').toLowerCase() !== 'polite') {
      issues.push({
        code: 'missing-polite-live',
        detail: 'Loading owner is missing aria-live=polite',
      });
    }

    const competing = Array.from(
      owner.querySelectorAll('[role="status"], [aria-busy="true"]')
    ).filter(element => element !== owner);

    if (competing.length > 0) {
      issues.push({
        code: 'competing-descendant',
        detail: `Loading owner has ${competing.length} competing status or busy descendants`,
      });
    }
  }

  const rawSkeletons = Array.from(
    container.querySelectorAll('.skeleton')
  ).filter(isRawSkeleton);

  if (rawSkeletons.length > 0) {
    issues.push({
      code: 'raw-skeleton',
      detail: `Rendered surface has ${rawSkeletons.length} raw skeleton implementation(s)`,
    });
  }

  return { owners, issues };
}

export function loadingOwnerIssueCodes(
  inspection: LoadingOwnerInspection
): readonly LoadingOwnerIssueCode[] {
  return inspection.issues.map(issue => issue.code);
}
