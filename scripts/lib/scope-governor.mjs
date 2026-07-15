export const FINDING_CLASSES = Object.freeze([
  'in-scope blocker',
  'follow-up',
  'stop-and-escalate',
]);

export const SCOPE_APPROVAL_TOKEN = 'scope-approved';

function positiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) >= 0
    ? Number(value)
    : 0;
}

export function normalizeScope(scope = {}) {
  return {
    originalFiles: positiveNumber(scope.originalFiles),
    originalNonTestLoc: positiveNumber(scope.originalNonTestLoc),
    currentFiles: positiveNumber(scope.currentFiles),
    currentNonTestLoc: positiveNumber(scope.currentNonTestLoc),
    reviewTriggeredFixCycles: Math.max(
      0,
      Math.floor(positiveNumber(scope.reviewTriggeredFixCycles))
    ),
    converged: scope.converged === true,
    approval:
      scope.approval === true ||
      String(scope.approval ?? '')
        .toLowerCase()
        .includes(SCOPE_APPROVAL_TOKEN),
  };
}

export function scopeExpansion(scope = {}) {
  const normalized = normalizeScope(scope);
  const filesExpanded =
    normalized.originalFiles > 0 &&
    normalized.currentFiles > normalized.originalFiles * 2;
  const nonTestLocExpanded =
    normalized.originalNonTestLoc > 0 &&
    normalized.currentNonTestLoc > normalized.originalNonTestLoc * 2;

  return {
    filesExpanded,
    nonTestLocExpanded,
    requiresApproval: filesExpanded || nonTestLocExpanded,
    approved: normalized.approval,
  };
}

export function shouldPauseForReclassification(scope = {}) {
  const normalized = normalizeScope(scope);
  return normalized.reviewTriggeredFixCycles >= 2 && !normalized.converged;
}

export function classifyFinding(finding = {}, scope = {}) {
  const normalized = normalizeScope(scope);
  const expansion = scopeExpansion(normalized);

  if (finding.accepted === false) return null;
  if (finding.stopAndEscalate === true || finding.outOfScope === true) {
    return 'stop-and-escalate';
  }
  if (expansion.requiresApproval && !expansion.approved) {
    return 'stop-and-escalate';
  }
  if (shouldPauseForReclassification(normalized)) {
    return 'stop-and-escalate';
  }
  if (finding.blocker === true && finding.inScope !== false) {
    return 'in-scope blocker';
  }
  return 'follow-up';
}

export function classifyAcceptedFindings(findings = [], scope = {}) {
  return findings
    .filter(finding => finding.accepted !== false)
    .map(finding => ({
      ...finding,
      classification: classifyFinding(finding, scope),
    }));
}

export function scopeDecision(scope = {}) {
  const normalized = normalizeScope(scope);
  const expansion = scopeExpansion(normalized);
  const paused = shouldPauseForReclassification(normalized);

  return {
    ...expansion,
    paused,
    action: paused
      ? 'pause-and-reclassify'
      : expansion.requiresApproval && !expansion.approved
        ? 'stop-and-escalate'
        : 'continue',
  };
}

if (import.meta.main) {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/lib/scope-governor.mjs <scope.json>');
    process.exit(1);
  }

  const scope = JSON.parse(input);
  console.log(JSON.stringify(scopeDecision(scope), null, 2));
}
