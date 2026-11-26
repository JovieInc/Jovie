#!/usr/bin/env node
/**
 * Pure Linear team-drift policy and evaluator for JOV-13101 (report-only).
 *
 * Every enrolled engineering team in Linear — JOV, LYB, SYM, plus later
 * enrollments — must carry the shared workflow-status names and types
 * (Merging, Validating, Rework, Done and the rest of the shared JOV set),
 * and the built-in Linear git automations must map start -> In Progress,
 * review -> In Review, merge -> Merging; merge may never map to Done.
 *
 * The evaluator is a pure function over a team snapshot: it RETURNS
 * findings and never mutates Linear. Unenrolled teams are drift with a
 * write-block signal — agents must not write there until enrollment grows
 * by PR. No transport, no I/O: scripts/linear-team-drift.mjs owns fetching.
 */

export const LINEAR_TEAM_POLICY_SCHEMA = 'jovie-linear-team-policy/v1';

/**
 * Engineering teams whose Linear workflow agents are allowed to write.
 * Enrollment is a PR decision on this list, never a Linear setting change.
 */
export const ENROLLED_TEAM_KEYS = Object.freeze(['JOV', 'LYB', 'SYM']);

/**
 * Shared workflow statuses, name -> Linear state type. Verified against the
 * live JOV team on 2026-11-19 (JOV and LYB match exactly; SYM differs).
 * @type {Readonly<Record<string, string>>}
 */
export const SHARED_WORKFLOW_STATUSES = Object.freeze({
  Backlog: 'backlog',
  Canceled: 'canceled',
  Done: 'completed',
  Duplicate: 'duplicate',
  'In Progress': 'started',
  'In Review': 'started',
  Merging: 'started',
  Rework: 'started',
  Triage: 'triage',
  Todo: 'unstarted',
  Validating: 'started',
});

/** The four statuses JOV-13101 names as the hard floor. */
export const REQUIRED_STATUS_NAMES = Object.freeze([
  'Merging',
  'Validating',
  'Rework',
  'Done',
]);

/**
 * Default-scope (any-branch) git automations must map these events to these
 * status names. Branch-scoped overrides are reported in the receipt but not
 * compared: per-branch overrides are deliberate Linear settings.
 * @type {Readonly<Record<string, string>>}
 */
export const GIT_AUTOMATION_STATE_POLICY = Object.freeze({
  start: 'In Progress',
  review: 'In Review',
  merge: 'Merging',
});

/**
 * An event may never land on these statuses, on any branch scope.
 * Merge -> Done is the one forbidden mapping Tim called out.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const GIT_AUTOMATION_FORBIDDEN_STATES = Object.freeze({
  merge: Object.freeze(['Done']),
});

/** One read-only query; pagination is detected, never guessed past. */
export const LINEAR_TEAM_DRIFT_QUERY = `
  query LinearTeamDrift($teamFirst: Int!, $stateFirst: Int!) {
    teams(first: $teamFirst) {
      pageInfo { hasNextPage }
      nodes {
        key
        name
        states(first: $stateFirst) {
          pageInfo { hasNextPage }
          nodes { name type }
        }
        gitAutomationStates(first: $stateFirst) {
          pageInfo { hasNextPage }
          nodes {
            event
            state { name type }
            targetBranch { branchPattern isRegex }
            archivedAt
          }
        }
      }
    }
  }
`;

/**
 * @typedef {Object} TeamSnapshot
 * @property {string} key
 * @property {string} name
 * @property {ReadonlyArray<{name: string, type: string}>} statuses
 * @property {ReadonlyArray<{
 *   event: string,
 *   state: string | null,
 *   targetBranch: string | null,
 *   archivedAt: string | null,
 * }>} gitAutomations
 * @property {boolean} truncated
 */

/**
 * @typedef {Object} DriftFinding
 * @property {string} team
 * @property {string} key
 * @property {'fail' | 'warn'} severity
 * @property {boolean} [writeBlock]
 * @property {string} detail
 */

/** Deterministic finding order for stable receipts and diffs. */
const FINDING_ORDER = Object.freeze([
  'unenrolled-team',
  'missing-enrolled-team',
  'missing-status',
  'status-type-mismatch',
  'extra-status',
  'git-automation-forbidden',
  'git-automation-mismatch',
  'git-automation-missing',
  'git-automation-no-action',
  'pagination-truncated',
]);

/**
 * Collapse a Linear GraphQL response into team snapshots. Unknown shapes
 * yield null so the caller reports an outage instead of guessing.
 * @param {unknown} data
 * @returns {ReadonlyArray<TeamSnapshot> | null}
 */
export function normalizeTeams(data) {
  const root =
    data && typeof data === 'object' && 'teams' in data
      ? /** @type {{ teams?: { nodes?: unknown[], pageInfo?: { hasNextPage?: boolean } } }} */ (
          data
        ).teams
      : null;
  if (!root || !Array.isArray(root.nodes)) return null;
  const teams = [];
  for (const node of root.nodes) {
    if (!node || typeof node !== 'object') return null;
    const team = /** @type {Record<string, unknown>} */ (node);
    const states = [];
    const stateRoot =
      team.states && typeof team.states === 'object'
        ? /** @type {{ nodes?: unknown[] }} */ (team.states)
        : null;
    if (!stateRoot || !Array.isArray(stateRoot.nodes)) return null;
    for (const node of stateRoot.nodes) {
      if (!node || typeof node !== 'object') return null;
      const entry = /** @type {Record<string, unknown>} */ (node);
      states.push({
        name: String(entry.name ?? ''),
        type: String(entry.type ?? ''),
      });
    }
    const automations = [];
    const automationRoot =
      team.gitAutomationStates && typeof team.gitAutomationStates === 'object'
        ? /** @type {{ nodes?: unknown[] }} */ (team.gitAutomationStates)
        : null;
    if (!automationRoot || !Array.isArray(automationRoot.nodes)) return null;
    for (const rule of automationRoot.nodes) {
      if (!rule || typeof rule !== 'object') return null;
      const entry = /** @type {Record<string, unknown>} */ (rule);
      const state = readStateName(entry.state);
      const branch = readBranchPattern(entry.targetBranch);
      automations.push({
        event: String(entry.event ?? ''),
        state,
        targetBranch: branch,
        archivedAt:
          typeof entry.archivedAt === 'string' ? entry.archivedAt : null,
      });
    }
    const truncated =
      connectionTruncated(root.pageInfo) ||
      connectionTruncated(
        stateRoot && 'pageInfo' in stateRoot
          ? /** @type {{ pageInfo?: { hasNextPage?: boolean } }} */ (stateRoot)
              .pageInfo
          : undefined
      ) ||
      connectionTruncated(
        automationRoot && 'pageInfo' in automationRoot
          ? /** @type {{ pageInfo?: { hasNextPage?: boolean } }} */ (
              automationRoot
            ).pageInfo
          : undefined
      );
    teams.push({
      key: String(team.key ?? ''),
      name: String(team.name ?? ''),
      statuses: states,
      gitAutomations: automations,
      truncated,
    });
  }
  return teams;
}

/** @param {unknown} pageInfo @returns {boolean} */
function connectionTruncated(pageInfo) {
  const info =
    pageInfo && typeof pageInfo === 'object'
      ? /** @type {{ hasNextPage?: boolean }} */ (pageInfo)
      : null;
  return Boolean(info && info.hasNextPage);
}

/** @param {unknown} state @returns {string | null} */
function readStateName(state) {
  if (!state || typeof state !== 'object') return null;
  const name = /** @type {Record<string, unknown>} */ (state).name;
  return typeof name === 'string' ? name : null;
}

/** @param {unknown} branch @returns {string | null} */
function readBranchPattern(branch) {
  if (!branch || typeof branch !== 'object') return null;
  const pattern = /** @type {Record<string, unknown>} */ (branch).branchPattern;
  return typeof pattern === 'string' ? pattern : null;
}

/**
 * Pure drift evaluation. Compares team snapshots against the pinned policy
 * and RETURNS findings; it never mutates its input and performs no I/O.
 * @param {ReadonlyArray<TeamSnapshot>} teams
 * @returns {ReadonlyArray<DriftFinding>}
 */
export function evaluateTeamDrift(teams) {
  /** @type {DriftFinding[]} */
  const findings = [];
  const seen = new Set();
  for (const team of teams) {
    seen.add(team.key);
    if (!ENROLLED_TEAM_KEYS.includes(team.key)) {
      findings.push({
        team: team.key,
        key: 'unenrolled-team',
        severity: 'fail',
        writeBlock: true,
        detail:
          `Linear team ${team.key} (${team.name}) is not enrolled; agent ` +
          'writes are blocked until ENROLLED_TEAM_KEYS grows by PR',
      });
      continue;
    }
    evaluateStatuses(team, findings);
    evaluateGitAutomations(team, findings);
    if (team.truncated) {
      findings.push({
        team: team.key,
        key: 'pagination-truncated',
        severity: 'warn',
        detail: 'Linear returned a truncated page for this team',
      });
    }
  }
  for (const key of ENROLLED_TEAM_KEYS) {
    if (!seen.has(key)) {
      findings.push({
        team: key,
        key: 'missing-enrolled-team',
        severity: 'fail',
        detail: 'enrolled team is absent from the Linear workspace',
      });
    }
  }
  return findings.sort(
    (a, b) =>
      a.team.localeCompare(b.team) ||
      FINDING_ORDER.indexOf(a.key) - FINDING_ORDER.indexOf(b.key) ||
      a.detail.localeCompare(b.detail)
  );
}

/**
 * @param {TeamSnapshot} team
 * @param {DriftFinding[]} findings
 */
function evaluateStatuses(team, findings) {
  const observed = new Map();
  for (const status of team.statuses) observed.set(status.name, status.type);
  for (const [name, expectedType] of Object.entries(SHARED_WORKFLOW_STATUSES)) {
    const type = observed.get(name);
    if (type === undefined) {
      findings.push({
        team: team.key,
        key: 'missing-status',
        severity: 'fail',
        detail:
          `missing shared status "${name}"` +
          (REQUIRED_STATUS_NAMES.includes(name)
            ? ' (required by JOV-13101)'
            : ''),
      });
    } else if (type !== expectedType) {
      findings.push({
        team: team.key,
        key: 'status-type-mismatch',
        severity: 'fail',
        detail: `status "${name}" has type "${type}", policy expects "${expectedType}"`,
      });
    }
  }
  for (const name of observed.keys()) {
    if (!Object.hasOwn(SHARED_WORKFLOW_STATUSES, name)) {
      findings.push({
        team: team.key,
        key: 'extra-status',
        severity: 'warn',
        detail:
          `status "${name}" is not in the shared set; alignment is a ` +
          'founder decision, reported only',
      });
    }
  }
}

/**
 * @param {TeamSnapshot} team
 * @param {DriftFinding[]} findings
 */
function evaluateGitAutomations(team, findings) {
  const active = team.gitAutomations.filter(rule => !rule.archivedAt);
  for (const [event, expected] of Object.entries(GIT_AUTOMATION_STATE_POLICY)) {
    const defaults = active.filter(
      rule => rule.event === event && rule.targetBranch === null
    );
    if (defaults.length === 0) {
      findings.push({
        team: team.key,
        key: 'git-automation-missing',
        severity: 'warn',
        detail:
          `no default-scope git automation for "${event}" -> ` +
          `"${expected}" (deleted or never configured; reported, pending ` +
          'founder decision)',
      });
      continue;
    }
    for (const rule of defaults) {
      if (rule.state === null) {
        findings.push({
          team: team.key,
          key: 'git-automation-no-action',
          severity: 'warn',
          detail:
            `git automation "${event}" is configured as no-action; ` +
            `policy expects "${expected}"`,
        });
      } else if (rule.state !== expected) {
        findings.push({
          team: team.key,
          key: 'git-automation-mismatch',
          severity: 'fail',
          detail: `git automation "${event}" maps to "${rule.state}", policy expects "${expected}"`,
        });
      }
    }
  }
  for (const [event, forbidden] of Object.entries(
    GIT_AUTOMATION_FORBIDDEN_STATES
  )) {
    for (const rule of active) {
      if (
        rule.event === event &&
        rule.state &&
        forbidden.includes(rule.state)
      ) {
        findings.push({
          team: team.key,
          key: 'git-automation-forbidden',
          severity: 'fail',
          detail:
            `git automation "${event}" maps to "${rule.state}" ` +
            `(forbidden; scope ${rule.targetBranch ?? 'default'})`,
        });
      }
    }
  }
}
