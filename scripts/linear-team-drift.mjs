#!/usr/bin/env node
/**
 * node scripts/linear-team-drift.mjs [--json] [--policy]
 *
 * JOV-13101 team drift guardrail (report-only). Fetches the Linear team
 * workflow snapshot, evaluates it against scripts/lib/linear-team-policy.mjs
 * and REPORTS drift; it never patches Linear (no mutation is imported).
 *
 * Failure semantics (JOV-13101 simulation 4): a Linear outage — missing
 * key, transport failure, rate limit, GraphQL error — fails OPEN on
 * shipping (exit 0, receipt mode "outage") and retries on the next run.
 * The check never fabricates findings from partial data.
 *
 * Exit code: 1 when any fail-severity finding is reported, else 0.
 * Read-only: one Linear GraphQL query; zero GitHub API calls; no polling.
 */

import { pathToFileURL } from 'node:url';

import { linearRequest } from './lib/linear-cooldown.mjs';
import {
  ENROLLED_TEAM_KEYS,
  evaluateTeamDrift,
  GIT_AUTOMATION_FORBIDDEN_STATES,
  GIT_AUTOMATION_STATE_POLICY,
  LINEAR_TEAM_DRIFT_QUERY,
  LINEAR_TEAM_POLICY_SCHEMA,
  normalizeTeams,
  REQUIRED_STATUS_NAMES,
  SHARED_WORKFLOW_STATUSES,
} from './lib/linear-team-policy.mjs';

export const LINEAR_TEAM_DRIFT_SCHEMA = 'jovie.linear-team-drift/v1';

/** @typedef {import('./lib/linear-team-policy.mjs').DriftFinding} DriftFinding */

/**
 * One read-only Linear pass. Outages fail open and fabricate nothing.
 *
 * @typedef {Object} ReceiptTeam
 * @property {string} key
 * @property {string} name
 * @property {boolean} enrolled
 * @property {boolean} writeBlock
 * @property {Record<string, string>} statuses
 * @property {ReadonlyArray<{
 *   event: string,
 *   state: string | null,
 *   scope: string,
 *   archived: boolean,
 * }>} gitAutomations
 * @property {boolean} truncated
 *
 * @typedef {Object} TeamDriftReceipt
 * @property {string} schema
 * @property {string} mode
 * @property {string} generatedAt
 * @property {Record<string, unknown>} policy
 * @property {ReadonlyArray<string>} enrolledTeamKeys
 * @property {ReadonlyArray<ReceiptTeam>} teams
 * @property {ReadonlyArray<DriftFinding>} findings
 * @property {string} [outageReason]
 * @property {string} [note]
 *
 * @typedef {{receipt: TeamDriftReceipt, exitCode: number}} TeamDriftRun
 *
 * @param {{
 *   apiKey?: string,
 *   fetchImpl?: typeof fetch,
 *   env?: Record<string, string | undefined>,
 *   nowMs?: number,
 * }} [options]
 * @returns {Promise<TeamDriftRun>}
 */
export async function runTeamDrift(options = {}) {
  const apiKey = options.apiKey ?? process.env.LINEAR_API_KEY ?? '';
  const nowMs = options.nowMs ?? Date.now();
  const base = {
    schema: LINEAR_TEAM_DRIFT_SCHEMA,
    generatedAt: new Date(nowMs).toISOString(),
    policy: policyReceipt(),
  };
  if (!apiKey) {
    return outageReceipt(base, 'missing_linear_api_key', 0);
  }
  const result = await linearRequest({
    key: apiKey,
    query: LINEAR_TEAM_DRIFT_QUERY,
    variables: { teamFirst: 250, stateFirst: 250 },
    fetchImpl: options.fetchImpl,
    env: options.env,
  });
  if (result.rateLimited || !result.ok) {
    const reason = result.rateLimited
      ? 'linear_rate_limited'
      : result.reason === 'transport'
        ? 'linear_team_drift_transport'
        : String(
            result.reason ?? `linear_http_${String(result.status ?? '0')}`
          );
    return outageReceipt(base, reason, 0);
  }
  const payload =
    /** @type {{errors?: unknown[], data?: {teams?: unknown}}} */ (result.data);
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    return outageReceipt(base, 'linear_team_drift_graphql_error', 0);
  }
  const teams = normalizeTeams(payload.data);
  if (!teams) {
    return outageReceipt(base, 'linear_team_drift_unexpected_shape', 0);
  }
  const findings = evaluateTeamDrift(teams);
  const failCount = findings.filter(
    finding => finding.severity === 'fail'
  ).length;
  const mode = failCount > 0 ? 'drift' : findings.length > 0 ? 'warn' : 'clean';
  /** @type {TeamDriftReceipt} */
  const receipt = {
    ...base,
    mode,
    enrolledTeamKeys: [...ENROLLED_TEAM_KEYS],
    teams: teams.map(team => ({
      key: team.key,
      name: team.name,
      enrolled: ENROLLED_TEAM_KEYS.includes(team.key),
      writeBlock: !ENROLLED_TEAM_KEYS.includes(team.key),
      statuses: Object.fromEntries(
        team.statuses.map(status => [status.name, status.type])
      ),
      gitAutomations: team.gitAutomations.map(rule => ({
        event: rule.event,
        state: rule.state,
        scope: rule.targetBranch ?? 'default',
        archived: rule.archivedAt !== null,
      })),
      truncated: team.truncated,
    })),
    findings,
  };
  return { receipt, exitCode: failCount > 0 ? 1 : 0 };
}

/** @returns {Record<string, unknown>} */
function policyReceipt() {
  return {
    schema: LINEAR_TEAM_POLICY_SCHEMA,
    enrolledTeamKeys: [...ENROLLED_TEAM_KEYS],
    requiredStatusNames: [...REQUIRED_STATUS_NAMES],
    statuses: { ...SHARED_WORKFLOW_STATUSES },
    gitAutomationStatePolicy: { ...GIT_AUTOMATION_STATE_POLICY },
    gitAutomationForbiddenStates: {
      merge: [...(GIT_AUTOMATION_FORBIDDEN_STATES.merge ?? [])],
    },
  };
}

/**
 * @param {{schema: string, generatedAt: string, policy: Record<string, unknown>}} base
 * @param {string} reason
 * @param {number} exitCode
 * @returns {TeamDriftRun}
 */
function outageReceipt(base, reason, exitCode) {
  /** @type {TeamDriftReceipt} */
  const receipt = {
    ...base,
    mode: 'outage',
    outageReason: reason,
    enrolledTeamKeys: [...ENROLLED_TEAM_KEYS],
    teams: [],
    findings: [],
    note: 'Linear unreadable; fail open on shipping, retry next run',
  };
  return { receipt, exitCode };
}

/** Human-readable report; the receipt stays the machine surface. */
function renderReport(receipt) {
  const lines = [];
  const findings = receipt.findings;
  lines.push(
    `linear-team-drift: ${receipt.mode} (${findings.length} finding(s))`
  );
  if (receipt.mode === 'outage') {
    lines.push(`  outage reason: ${String(receipt.outageReason)}`);
    lines.push('  fail open on shipping; retry next run');
  }
  for (const finding of findings) {
    lines.push(
      `  [${finding.severity}] ${finding.team}: ${finding.key} — ${finding.detail}`
    );
    if (finding.writeBlock) {
      lines.push('    AGENT WRITES BLOCKED until this team is enrolled');
    }
  }
  const teams = receipt.teams;
  lines.push(
    `  teams: ${teams
      .map(team => `${team.key}${team.enrolled ? '' : ' (unenrolled)'}`)
      .join(', ')}`
  );
  return lines.join('\n');
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--policy')) {
    process.stdout.write(`${JSON.stringify(policyReceipt(), null, 2)}\n`);
    return 0;
  }
  const { receipt, exitCode } = await runTeamDrift();
  if (argv.includes('--json') || receipt.mode === 'outage') {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderReport(receipt)}\n`);
  }
  return exitCode;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().then(code => {
    process.exitCode = code;
  });
}
