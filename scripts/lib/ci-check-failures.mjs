/** Terminal CI conclusions — mirror scripts/drain-pr-queue.sh check_failures_for_pr. */
export const TERMINAL_FAILURE_STATES = new Set([
  'FAILURE',
  'ERROR',
  'TIMED_OUT',
  'ACTION_REQUIRED',
  'STARTUP_FAILURE',
]);

const ADVISORY_RE = /advisory|Preview Deploy|Slop Gate/i;

export function isTerminalFailureCheck(check) {
  const bucket = String(check.bucket ?? '');
  if (bucket && /^fail$/i.test(bucket)) return true;
  const state = String(check.state ?? check.conclusion ?? '').toUpperCase();
  return TERMINAL_FAILURE_STATES.has(state);
}

export function isAdvisoryCheckName(name) {
  return ADVISORY_RE.test(String(name ?? ''));
}

export function extractTerminalFailureNames(checks = []) {
  const names = new Set();
  for (const check of checks) {
    const name = check.name ?? check.workflow ?? check.description ?? '';
    if (!name || isAdvisoryCheckName(name)) continue;
    if (isTerminalFailureCheck(check)) names.add(String(name));
  }
  return [...names].sort();
}

export function normalizeCheckKey(name) {
  return String(name ?? '')
    .replace(/^CI\s*\/\s*/i, '')
    .trim()
    .toLowerCase();
}