const SHA = /^[0-9a-f]{40}$/u;
const ACTIONS = new Set(['opened', 'reopened', 'synchronize']);
const HOLD_LABELS = new Set(['hold', 'gated', 'incident']);

export function parseConflictEvent(payload, repo) {
  const pr = payload?.pull_request;
  const number = pr?.number;
  if (
    !ACTIONS.has(payload?.action) ||
    payload?.repository?.full_name !== repo ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    number > 1_000_000 ||
    payload?.number !== number ||
    pr?.state !== 'open' ||
    pr?.draft !== false ||
    pr?.base?.repo?.full_name !== repo ||
    pr?.head?.repo?.full_name !== repo ||
    pr?.head?.repo?.fork !== false ||
    pr?.base?.ref !== 'main' ||
    !pr?.head?.ref ||
    !SHA.test(pr?.base?.sha ?? '') ||
    !SHA.test(pr?.head?.sha ?? '')
  ) {
    return null;
  }
  return {
    repo,
    number,
    action: payload.action,
    head: pr.head.sha,
    base: pr.base.sha,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
  };
}

export function hasConflictHold(labels) {
  return (
    !Array.isArray(labels) ||
    labels.some(label => {
      const name = typeof label === 'string' ? label : label?.name;
      return typeof name !== 'string' || HOLD_LABELS.has(name.toLowerCase());
    })
  );
}

export function matchesRawConflictPr(scope, detail) {
  return (
    detail?.number === scope.number &&
    detail?.state === 'open' &&
    detail?.draft === false &&
    detail?.base?.repo?.full_name === scope.repo &&
    detail?.head?.repo?.full_name === scope.repo &&
    detail?.head?.repo?.fork === false &&
    detail?.base?.ref === scope.baseRef &&
    detail?.head?.ref === scope.headRef &&
    detail?.base?.sha === scope.base &&
    detail?.head?.sha === scope.head &&
    Array.isArray(detail?.labels) &&
    !hasConflictHold(detail.labels)
  );
}

export function matchesHydratedConflictPr(scope, pr) {
  return (
    pr?.number === scope.number &&
    pr?.isDraft === false &&
    pr?.baseRefName === scope.baseRef &&
    pr?.headRefName === scope.headRef &&
    pr?.baseRefOid === scope.base &&
    pr?.headRefOid === scope.head &&
    pr?.headRepository?.nameWithOwner === scope.repo &&
    pr?.isCrossRepository === false &&
    !hasConflictHold(pr?.labels)
  );
}
