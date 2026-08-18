/**
 * Fail-closed compatibility facade for the retired GitHub-Issue tracker.
 *
 * Linear-backed Symphony is the sole backlog selector. These exports remain
 * only so stale imports fail safely while callers migrate. No function in this
 * module invokes GitHub, creates or updates an Issue, or infers dispatchable
 * work from Issue metadata.
 */

export const STATUS_IN_PROGRESS = 'status:in-progress';
export const STATUS_IN_REVIEW = 'status:in-review';
export const AGENT_READY_LABEL = 'agent-ready';
export const CLAIM_OWNER_MARKER = 'github-ai-claim-owner';
export const CLAIM_FINALIZED_MARKER = 'github-ai-claim-finalized';
export const GITHUB_ISSUE_INTAKE_RETIRED = true;

/** @type {ReadonlySet<string>} */
export const STATUS_LABELS = new Set([STATUS_IN_PROGRESS, STATUS_IN_REVIEW]);

const RETIRED_ERROR = 'GitHub Issue intake retired; use Linear-backed Symphony';

/**
 * Retired argument builder retained as a zero-capability compatibility shim.
 *
 * @param {{ title: string, labels?: readonly string[] }} input
 * @returns {readonly string[]}
 */
export function buildIssueCreateArgs(input) {
  void input;
  return [];
}

/** Historical/reporting-only URL parser. */
export function parseIssueNumber(url) {
  const match = /\/issues\/(\d+)\s*$/.exec(url ?? '');
  return match ? Number(match[1]) : null;
}

/** Retired GitHub Issue creator shim. Never invokes its executor. */
export function fileGithubIssue(input, exec) {
  void input;
  void exec;
  return { success: false, url: null, error: RETIRED_ERROR };
}

/** The dual-write migration is over; there is no mirror path. */
export function shouldMirrorLinear(env = process.env) {
  void env;
  return false;
}

/** Retired GitHub Issue claim shim. Never invokes its executor. */
export function claimIssue(input, exec) {
  void input;
  void exec;
  return { success: false, changed: false, error: RETIRED_ERROR };
}

/** Retired GitHub Issue finalizer shim. Never invokes its executor. */
export function finalizeIssueClaim(input, exec) {
  void input;
  void exec;
  return { success: false, changed: false, error: RETIRED_ERROR };
}

/** Retired GitHub Issue transition shim. Never invokes its executor. */
export function transitionIssue(input, exec) {
  void input;
  void exec;
  return { success: false, changed: false, error: RETIRED_ERROR };
}

/** Retired GitHub Issue selector shim. Never invokes its executor. */
export function queryTodoIssues(input = {}, exec) {
  void input;
  void exec;
  return {
    success: false,
    issues: [],
    error: 'GitHub Issue selection retired; use Linear-backed Symphony',
  };
}

/** Retired intake predicate. GitHub Issue metadata can never admit work. */
export function shouldDispatchIssue(issue) {
  void issue;
  return false;
}
