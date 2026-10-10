#!/usr/bin/env node

/**
 * Backlog orchestrator for Jovie.
 *
 * Continuously scans Linear's issue backlog, classifies, ranks,
 * bundles workstreams, and controls admission to the shipping pipeline.
 *
 * Deterministic-first — model calls only for semantic ambiguity.
 *
 * Usage:
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs reconcile
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs reconcile --issue JOV-123
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs reconcile --dry-run
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs audit
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs remediate
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs report
 */

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const __dirname = dirname(fileURLToPath(import.meta.url));

import * as admissionGate from './admission-gate.mjs';
import { preAdmissionDecision } from './admission-policy.mjs';
// Keep the complete control-plane dependency closure visible to source sync and
// module tooling. These are canonical sibling modules, not host-only copies.
import * as admitter from './admitter.mjs';
import * as backlogHygiene from './backlog-hygiene.mjs';
import * as backlogReduction from './backlog-reduction.mjs';
import * as backlogRemediation from './backlog-remediation.mjs';
import * as classifier from './classifier.mjs';
import * as contextGate from './context-gate.mjs';
import { reconcileConversationRequest } from './conversation-intake.mjs';
import * as deterministicGates from './deterministic-gates.mjs';
import {
  buildEligibilityCensus,
  completeAuditInventory,
} from './eligibility-census.mjs';
import * as gateNextHold from './gate-next-hold.mjs';
import { cliGbrainClient } from './gbrain-client.mjs';
import * as intakeReadiness from './intake-readiness.mjs';
import * as laneCapacity from './lane-capacity.mjs';
import * as linear from './linear-client.mjs';
import * as ownershipInventory from './ownership-inventory.mjs';
import * as planGate from './plan-gate.mjs';
import * as reconciler from './reconcile.mjs';
import * as reporter from './reporter.mjs';
import * as researchGate from './research-gate.mjs';
import * as runtimeState from './runtime-state.mjs';
import * as scorer from './scorer.mjs';
import {
  gateShippingLeadRequest,
  materializeReviewedPlanAdmission,
} from './shipping-lead-gate.mjs';
import * as staleLeaseGuard from './stale-lease-guard.mjs';
import { shippingTaskProfile } from './summer-shipping-lead-contract.mjs';
import {
  buildRoutingReceipt,
  readCodexRotateCapacity,
  selectSymphonyRoute,
  verifyRoutingReceipt,
} from './symphony-routing.mjs';
import { buildAgentReadyTriageWatchdog } from './triage-router.mjs';
import * as workstreamer from './workstreamer.mjs';

const execFileAsync = promisify(execFile);
const TEAM_FILE_CONFIG = JSON.parse(
  readFileSync(new URL('./config.json', import.meta.url), 'utf8')
);

// ----- Config -----
// Never write beside the checkout. In-tree `.orchestrator-cache.json` is the
// dirty file that fail-closed gem's no-LLM plane (JOV-5076).
const CACHE_FILE = runtimeState.assertsOutsideGitTree(
  runtimeState.resolveCacheFile({ orchestratorDir: __dirname }),
  __dirname
);
const FLEET_GATE_RECEIPT_FILE =
  process.env.JOVIE_FLEET_GATE_RECEIPT ||
  resolve(
    process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
    'state/gem-priority-gate/latest.json'
  );

// JOV-8000 follow-up 33: the Refresh step's same-run receipt lands at
// ${RUNNER_TEMP}/jovie-fleet-gate.json (evaluate-fleet-gate.sh:29). A second
// host writer running older gate code can overwrite the persisted
// latest.json between Refresh and Remediate (the 38031492172 residual:
// receipt printed hold-intake while the remediator read an older blocked
// receipt off the host). In Actions, prefer the same-run file.
function sameRunFleetGateReceiptPath(env) {
  return resolve(env.RUNNER_TEMP || '/tmp', 'jovie-fleet-gate.json');
}

const TEAM_CONFIGS = Object.freeze([
  Object.freeze({
    key: 'JOV',
    id: 'bdc09edc-f91c-4a06-b308-74b4fcf093f8',
    intakeStates: ['Triage'],
    backlogStateId: '1551ed21-7743-4573-82d8-8949410d3b8d',
    todoStateId: 'c6c00506-dc9f-4910-8ff7-3874dd77174c',
    healthUrl: 'https://jov.ie/api/health',
    healthKind: 'json-status',
  }),
  Object.freeze({
    key: 'LYB',
    id: '119e4dea-db83-4718-885a-70869d74445e',
    intakeStates: ['Backlog'],
    backlogStateId: '63ced43e-ab22-48e8-9dcc-a2ce54ee6da9',
    todoStateId: '4b318cc8-0a57-489c-8370-b780e11cff7f',
    // Probe a small, direct production artifact. The redirecting homepage can
    // spend almost the entire timeout downloading HTML and flap admission red.
    healthUrl: 'https://www.logyourbody.com/robots.txt',
    healthKind: 'http-ok',
  }),
]);

function teamForIdentifier(identifier) {
  const key = /^([A-Za-z][A-Za-z0-9]*)-\d+$/.exec(identifier || '')?.[1];
  return TEAM_CONFIGS.find(
    team => team.key === String(key || '').toUpperCase()
  );
}

// ----- Cache -----
function loadCache() {
  try {
    return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
  } catch {
    return { version: 1, fingerprints: {}, classifications: [] };
  }
}

function saveCache(cache) {
  runtimeState.ensureParentDir(CACHE_FILE);
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ----- Main -----
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const isDryRun = args.includes('--dry-run');
  const issueArg = args.find(a => a.startsWith('--issue='))?.split('=')[1];
  const evidenceFile = args
    .find(a => a.startsWith('--evidence-file='))
    ?.split('=')
    .slice(1)
    .join('=');
  const evidenceJson = args
    .find(a => a.startsWith('--evidence='))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!command || command === '--help') {
    console.log(`
Usage:
  node backlog-orchestrator.mjs reconcile           Process new/modified issues
  node backlog-orchestrator.mjs reconcile --dry-run  Dry run (no mutations)
  node backlog-orchestrator.mjs reconcile --issue=JOV-123  Single issue
  node backlog-orchestrator.mjs audit                Full backlog audit (shadow)
  node backlog-orchestrator.mjs remediate             Inventory, select a cohort, feed official Symphony
  node backlog-orchestrator.mjs remediate --dry-run   Inventory and report without mutations
  node backlog-orchestrator.mjs intake-readiness      Classify changed intake work (always dry-run)
  node backlog-orchestrator.mjs backlog-reduction     Audit high-confidence duplicate reduction (dry-run)
  node backlog-orchestrator.mjs backlog-hygiene       Aged dedup + stale Sentry-only hygiene pass (dry-run)
  node backlog-orchestrator.mjs reconcile-conversation --evidence-file=/path/request.json
  node backlog-orchestrator.mjs approve-research --issue=JOV-123 --evidence-file=/path/research.json
  node backlog-orchestrator.mjs report                Generate shadow report
`);
    return;
  }

  if (['admit-next', 'gate-next', 'approve-plan'].includes(command)) {
    console.error(
      `${command} is disabled; upstream openai/symphony owns Linear pickup and dispatch`
    );
    process.exit(78);
  }

  const cache = loadCache();

  if (command === 'audit' || command === 'report') {
    await runAudit(cache, isDryRun);
  } else if (command === 'reconcile') {
    await runReconcile(cache, isDryRun, issueArg);
  } else if (command === 'admit-next') {
    await runAdmitNext(cache, isDryRun);
  } else if (command === 'gate-next') {
    await runGateNext(isDryRun, issueArg);
  } else if (command === 'remediate') {
    await runRemediate(isDryRun);
  } else if (command === 'intake-readiness') {
    await runIntakeReadiness(cache, issueArg);
  } else if (command === 'backlog-reduction') {
    await runBacklogReduction(cache);
  } else if (command === 'backlog-hygiene') {
    await runBacklogHygiene(cache);
  } else if (command === 'reconcile-conversation') {
    await runConversationReconciliation(evidenceFile, evidenceJson, isDryRun);
  } else if (command === 'approve-plan') {
    await runApprovePlan(issueArg, evidenceFile, evidenceJson, isDryRun);
  } else if (command === 'approve-research') {
    await runApproveResearch(issueArg, evidenceFile, evidenceJson, isDryRun);
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
}

async function runConversationReconciliation(
  evidenceFile,
  evidenceJson,
  isDryRun
) {
  if (!evidenceFile && !evidenceJson)
    throw new Error(
      'reconcile-conversation requires --evidence-file or --evidence'
    );
  const request = evidenceFile
    ? JSON.parse(readFileSync(evidenceFile, 'utf8'))
    : JSON.parse(evidenceJson);
  const receipt = await reconcileConversationRequest({
    request,
    teamId: TEAM_CONFIGS[0].id,
    stateId: TEAM_FILE_CONFIG.states.triage,
    client: linear,
    dryRun: isDryRun,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

async function runIntakeReadiness(cache, issueArg) {
  const teams = [];
  const nextFingerprints = {
    ...(cache.intakeReadiness?.fingerprintsByIdentifier || {}),
  };
  const selectedTeams = issueArg
    ? [teamForIdentifier(issueArg)].filter(Boolean)
    : TEAM_CONFIGS;
  if (issueArg && selectedTeams.length === 0)
    throw new Error(`Issue ${issueArg} has no repository route`);
  for (const team of selectedTeams) {
    const issues = issueArg
      ? [await linear.fetchIssue(issueArg)].filter(issue =>
          ['Triage', 'Backlog', 'Todo', 'To Do'].includes(issue?.state?.name)
        )
      : await linear.fetchTeamIntakeIssues(team.id);
    const receipt = intakeReadiness.buildIntakeControlLoopReceipt(issues, {
      previousFingerprints: nextFingerprints,
    });
    for (const item of receipt.receipts) {
      nextFingerprints[item.issue] = item.fingerprint;
    }
    teams.push({ team: team.key, ...receipt });
  }
  const result = {
    schema: 'intake-control-loop/multiteam/v1',
    mode: 'dry-run',
    observedAt: new Date().toISOString(),
    teams,
    mutations: 0,
  };
  saveCache({
    ...cache,
    intakeReadiness: {
      fingerprintsByIdentifier: nextFingerprints,
      lastReceipt: result,
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

async function runBacklogReduction(cache) {
  const teams = [];
  for (const team of TEAM_CONFIGS) {
    const issues = await linear.fetchTeamIntakeIssues(team.id);
    teams.push({
      team: team.key,
      ...backlogReduction.buildBacklogReductionReceipt(issues),
    });
  }
  const result = {
    schema: 'backlog-reduction/multiteam/v1',
    mode: 'dry-run',
    observedAt: new Date().toISOString(),
    teams,
    mutations: 0,
  };
  saveCache({ ...cache, backlogReduction: { lastReceipt: result } });
  console.log(JSON.stringify(result, null, 2));
}

async function runBacklogHygiene(cache) {
  const teams = [];
  for (const team of TEAM_CONFIGS) {
    const issues = await linear.fetchTeamIntakeIssues(team.id);
    teams.push({
      team: team.key,
      ...backlogHygiene.buildBacklogHygieneReceipt(issues),
    });
  }
  const result = {
    schema: 'backlog-hygiene/multiteam/v1',
    mode: 'dry-run',
    observedAt: new Date().toISOString(),
    teams,
    mutations: 0,
  };
  saveCache({ ...cache, backlogHygiene: { lastReceipt: result } });
  console.log(JSON.stringify(result, null, 2));
}

async function runApprovePlan(issueArg, evidenceFile, evidenceJson, isDryRun) {
  if (!issueArg || (!evidenceFile && !evidenceJson))
    throw new Error(
      'approve-plan requires --issue and --evidence-file or --evidence'
    );
  const evidence = evidenceFile
    ? JSON.parse(readFileSync(evidenceFile, 'utf8'))
    : JSON.parse(evidenceJson);
  const issue = await linear.fetchIssue(issueArg);
  if (!issue) throw new Error(`Issue ${issueArg} not found`);
  const team = teamForIdentifier(issue.identifier);
  if (!team)
    throw new Error(`Issue ${issue.identifier} has no repository route`);
  const reason = planGate.validatePlanCandidate(issue, evidence);
  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          schema: planGate.PLAN_GATE_SCHEMA,
          status: reason ? 'rejected' : 'would-approve',
          reason,
        },
        null,
        2
      )
    );
    return;
  }
  const receipt = await planGate.approvePlan({
    issue,
    evidence,
    client: linear,
    teamId: team.id,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

async function approveSymphonyRoute(issue, isDryRun, client = linear) {
  const preAdmission = preAdmissionDecision(issue);
  if (!preAdmission.allowed)
    return {
      status: 'blocked',
      reason: preAdmission.reason.code,
      preAdmission,
    };
  const existing = verifyRoutingReceipt(issue, {
    requireCapacityEvidence: true,
  });
  if (existing) return { status: 'already-routed', route: existing };
  const capacity = readCodexRotateCapacity();
  const decision = selectSymphonyRoute({ issue, capacity });
  if (decision.status === 'blocked') return decision;
  if (isDryRun) return { status: 'would-route', route: decision.route };
  const receipt = buildRoutingReceipt(decision.route);
  const result = await client.addComment(issue.id, receipt);
  if (!result?.commentCreate?.success && !result?.success)
    throw new Error('symphony-routing-receipt-mutation-failed');
  const reread = await client.fetchIssue(issue.identifier);
  const verified = verifyRoutingReceipt(reread, {
    requireCapacityEvidence: true,
  });
  if (!verified || verified.fingerprint !== decision.route.fingerprint)
    throw new Error('symphony-routing-receipt-verification-failed');
  return { status: 'routed', route: verified };
}

/**
 * Bind caller-supplied primary-source research evidence (queries, dated
 * citations, findings) for a research-required issue to one
 * symphony-research/v1 receipt. Validation is deterministic and fail-closed.
 */
async function runApproveResearch(
  issueArg,
  evidenceFile,
  evidenceJson,
  isDryRun
) {
  if (!issueArg || (!evidenceFile && !evidenceJson))
    throw new Error(
      'approve-research requires --issue and --evidence-file or --evidence'
    );
  const supplied = evidenceFile
    ? JSON.parse(readFileSync(evidenceFile, 'utf8'))
    : JSON.parse(evidenceJson);
  const issue = await linear.fetchIssue(issueArg);
  if (!issue) throw new Error(`Issue ${issueArg} not found`);
  const team = teamForIdentifier(issue.identifier);
  if (!team)
    throw new Error(`Issue ${issue.identifier} has no repository route`);
  const evidence = {
    issue: issue.identifier,
    issueHash: contextGate.issueContentHash(issue),
    classification: supplied.classification,
    rationale: supplied.rationale,
    queries: supplied.queries || [],
    citations: supplied.citations || [],
    findings: supplied.findings || [],
    observedAt: supplied.observedAt || new Date().toISOString(),
  };
  const invalid = researchGate.validateResearchEvidence(issue, evidence);
  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          schema: researchGate.RESEARCH_GATE_SCHEMA,
          status: invalid ? 'rejected' : 'would-approve',
          reason: invalid,
        },
        null,
        2
      )
    );
    return;
  }
  if (invalid) {
    console.log(
      JSON.stringify(
        {
          schema: researchGate.RESEARCH_GATE_SCHEMA,
          status: 'rejected',
          reason: invalid,
        },
        null,
        2
      )
    );
    return;
  }
  const receipt = await researchGate.approveResearch({
    issue,
    evidence,
    client: linear,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

async function teamProductionStatus(team) {
  try {
    const response = await fetch(team.healthUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return 'red';
    if (team.healthKind === 'json-status') {
      const data = /** @type {{ status?: string }} */ (await response.json());
      return data.status === 'ok' ? 'green' : 'red';
    }
    return 'green';
  } catch {
    return 'unknown';
  }
}

function readFleetGateReceiptFile(path) {
  try {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    return receipt?.schema === admitter.FLEET_GATE_SCHEMA &&
      receipt?.signals &&
      typeof receipt.signals === 'object'
      ? receipt
      : null;
  } catch {
    return null;
  }
}

// JOV-8000 follow-up 33: receipt source order for the remediator.
// (1) JOVIE_FLEET_GATE_RECEIPT when set (explicit override, tests included).
// (2) In GitHub Actions, the SAME-RUN receipt the Refresh step just wrote to
//     ${RUNNER_TEMP}/jovie-fleet-gate.json — adopted only when it is the
//     typed fleet-gate schema, bound to an exact 40-hex main sha, and no
//     older than the controller receipt window; a missing, malformed, or
//     stale same-run file is ignored (fail closed to the host receipt).
// (3) The persisted host receipt (latest.json), which a second host writer
//     running older gate code can overwrite between Refresh and Remediate
//     (the 38031492172 residual: Refresh printed hold-intake while the
//     remediator read an older blocked latest.json off the host).
export function loadFleetGateReceipt(
  team,
  { now = new Date().toISOString(), env = process.env } = {}
) {
  if (team.key !== 'JOV') return null;
  const hostPath =
    env.JOVIE_FLEET_GATE_RECEIPT ||
    (env.GEM_WORKSPACE
      ? resolve(env.GEM_WORKSPACE, 'state/gem-priority-gate/latest.json')
      : FLEET_GATE_RECEIPT_FILE);
  if (env.GITHUB_ACTIONS === 'true' && !env.JOVIE_FLEET_GATE_RECEIPT) {
    const nowMs = Date.parse(now);
    const sameRunPath = sameRunFleetGateReceiptPath(env);
    const sameRun = readFleetGateReceiptFile(sameRunPath);
    const mainSha = sameRun?.signals?.main?.sha;
    const observedMs = Date.parse(sameRun?.observedAt || '');
    if (
      sameRun &&
      typeof mainSha === 'string' &&
      /^[0-9a-f]{40}$/.test(mainSha) &&
      Number.isFinite(observedMs) &&
      observedMs <= nowMs &&
      nowMs - observedMs <= admitter.CONTROLLER_RECEIPT_MAX_AGE_MS
    ) {
      return {
        receipt: sameRun,
        source: 'same-run',
        path: sameRunPath,
        observedAt: sameRun.observedAt,
      };
    }
  }
  const receipt = readFleetGateReceiptFile(hostPath);
  return receipt
    ? {
        receipt,
        source:
          env.JOVIE_FLEET_GATE_RECEIPT &&
          env.JOVIE_FLEET_GATE_RECEIPT !== FLEET_GATE_RECEIPT_FILE
            ? 'override'
            : 'host-persisted',
        path: hostPath,
        observedAt: receipt.observedAt ?? null,
      }
    : null;
}

export async function fleetGateForTeam(team, now = new Date().toISOString()) {
  const loaded = loadFleetGateReceipt(team, { now });
  const receipt = loaded?.receipt ?? null;
  const receiptMain = receipt?.signals?.main?.status;
  // JOV-8000 follow-up 30: the production signal comes from the SAME-RUN
  // persisted receipt (the canonical python writer's own observation, with
  // its deployedSha binding and fetch evidence) — not a second live fetch
  // from the remediate step. The live re-fetch re-observed production
  // seconds after the receipt was written and, on a flaky runner egress or
  // a 5s timeout miss, returned unknown where the receipt said green —
  // re-deriving {controller-failure, production-unknown} and binding
  // capacity merge-queue-blocked while the receipt said hold-intake (the
  // 38027107786 split-brain). Fail closed: when the receipt is missing or
  // carries no production signal, fall back to the live fetch as before.
  const receiptProduction = receipt?.signals?.production;
  const productionStatus =
    typeof receiptProduction?.status === 'string' &&
    ['green', 'red', 'unknown'].includes(receiptProduction.status)
      ? receiptProduction.status
      : await teamProductionStatus(team);
  const fleetGate = admitter.evaluateFleetGate(
    {
      main: {
        status:
          receiptMain === 'red'
            ? 'red'
            : receiptMain === 'green'
              ? 'green'
              : 'unknown',
        sha: receipt?.signals?.main?.sha,
      },
      production: {
        status: productionStatus,
        deployedSha: receiptProduction?.deployedSha,
      },
      controller: {
        status: receipt?.signals?.controller?.status || 'unknown',
      },
      integrity: receipt?.signals?.integrity || { status: 'clear' },
      queue: receipt?.signals?.queue,
      closureHealth: receipt?.signals?.closureHealth,
      concurrencyEvidence: receipt?.signals?.concurrencyEvidence,
      independentReview: receipt?.signals?.independentReview,
      observedAt: receipt?.observedAt,
    },
    { now }
  );
  // JOV-8000 follow-up 33: make the receipt-vs-derivation split-brain
  // observable instead of silent. The derived mode stays authoritative
  // (never less restrictive); a mismatch means the receipt file and the
  // derivation disagree and a human should look at the receipt source.
  const receiptPromotionMode =
    typeof receipt?.promotionMode === 'string' ? receipt.promotionMode : null;
  const derivedPromotionMode = fleetGate.promotionMode;
  const fleetGateEvidence = {
    source: loaded?.source ?? null,
    path: loaded?.path ?? null,
    observedAt: loaded?.observedAt ?? null,
    receiptPromotionMode,
    derivedPromotionMode,
    reasons: fleetGate.reasons.map(reason => reason.code),
  };
  console.log(
    `capacity.fleet-gate source=${fleetGateEvidence.source ?? 'none'} receipt_mode=${receiptPromotionMode ?? 'none'} derived_mode=${derivedPromotionMode} reasons=[${fleetGateEvidence.reasons.join(';')}]`
  );
  if (
    receiptPromotionMode &&
    derivedPromotionMode &&
    receiptPromotionMode !== derivedPromotionMode
  ) {
    console.log(
      `::warning::fleet-gate.split-brain receipt promotionMode=${receiptPromotionMode} but derived=${derivedPromotionMode} (source=${fleetGateEvidence.source ?? 'none'}); keeping the derived mode`
    );
  }
  return { ...fleetGate, fleetGateEvidence };
}

async function recoverStaleLeases(team, isDryRun) {
  // Recovery is deliberately before work-admission checks. A stale or failed
  // controller may freeze new pickup, but it must not strand a provably safe
  // old lease and consume capacity forever.
  const inProgressIssues = await linear.fetchTeamInProgressIssues(team.id);
  if (isDryRun) {
    const eligible = inProgressIssues
      .map(issue => ({
        identifier: issue.identifier,
        decision: staleLeaseGuard.classifyStaleLease(issue),
      }))
      .filter(entry => entry.decision.eligible);
    return {
      schema: 'stale-lease-recovery/v1',
      mode: 'dry-run',
      recovered: [],
      eligible: eligible.map(entry => entry.identifier),
      skipped: inProgressIssues
        .filter(
          issue =>
            !eligible.some(entry => entry.identifier === issue.identifier)
        )
        .map(issue => issue.identifier),
      failed: [],
    };
  }
  const result = await staleLeaseGuard.sweepStaleLeases({
    issues: inProgressIssues,
    client: linear,
    todoStateId: team.todoStateId,
  });
  return {
    schema: 'stale-lease-recovery/v1',
    mode: 'mutating',
    ...result,
  };
}

async function admissionPreflight(
  team,
  candidate = null,
  { excludeIssueId = null } = {}
) {
  const fleetGate = await fleetGateForTeam(team);
  if (
    !fleetGate.workAdmission.allowed ||
    !fleetGate.workAdmission.activities.includes('approved-issue-lease')
  ) {
    return {
      open: false,
      reason: `fleet gate ${fleetGate.state.toLowerCase()} blocks new issue pickup`,
      load: { count: 0, identifiers: [] },
      fleetGate,
    };
  }
  const symphonyIssues = (await linear.fetchTeamSymphonyIssues(team.id)).filter(
    issue => issue.id !== excludeIssueId
  );
  const load = deterministicGates.admissionIntentLoad(symphonyIssues);
  const maxConcurrent = fleetGate.concurrency?.gem?.maxConcurrent ?? 0;
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    return {
      open: false,
      reason:
        fleetGate.concurrency?.gem?.reason ||
        'measured admission capacity unavailable',
      load,
      fleetGate,
    };
  }
  if (load.count >= maxConcurrent) {
    return {
      open: false,
      reason: `measured admission capacity exhausted (${load.count}/${maxConcurrent})`,
      load,
      fleetGate,
    };
  }
  if (candidate) {
    const candidateTarget =
      ownershipInventory.resolveAdmissionTarget(candidate);
    if (candidateTarget.decision !== 'admit') {
      return {
        open: false,
        disposition: 'defer',
        reasonCode: candidateTarget.reason || 'collision-domain-missing',
        reason:
          candidateTarget.reason || 'candidate collision domain unavailable',
        load,
        fleetGate,
      };
    }
    const laneDecision = laneCapacity.evaluateLaneCapacity(
      fleetGate.laneCapacity,
      candidateTarget.target.collision_domains
    );
    if (!laneDecision.allowed) {
      return {
        open: false,
        disposition: laneDecision.disposition,
        reasonCode: laneDecision.code,
        reason:
          laneDecision.domain && Number.isInteger(laneDecision.ready)
            ? `${laneDecision.code}: ${laneDecision.domain} (${laneDecision.ready}/${laneDecision.budget})`
            : laneDecision.code,
        load,
        fleetGate,
      };
    }
    const active = symphonyIssues.filter(issue =>
      load.identifiers.includes(issue.identifier)
    );
    const collisions = active
      .map(issue => ({
        issue: issue.identifier,
        target: ownershipInventory.resolveAdmissionTarget(issue),
      }))
      .filter(
        entry =>
          candidateTarget.decision === 'admit' &&
          entry.target.decision === 'admit' &&
          ownershipInventory.admissionTargetsCollide(
            candidateTarget.target,
            entry.target.target
          )
      )
      .map(entry => entry.issue);
    if (collisions.length > 0) {
      return {
        open: false,
        disposition: 'defer',
        reasonCode: 'collision-domain-leased',
        reason: `collision domain already leased by ${collisions.join(', ')}`,
        load,
        fleetGate,
      };
    }
  }
  return {
    open: true,
    reason: 'open',
    load,
    fleetGate,
  };
}

async function runGateNext(isDryRun, issueArg) {
  const teams = issueArg
    ? [teamForIdentifier(issueArg)].filter(Boolean)
    : TEAM_CONFIGS;
  if (teams.length === 0)
    throw new Error(`Issue ${issueArg} has no repository route`);
  const results = [];
  for (const team of teams) {
    try {
      results.push(await runTeamGateNext(team, isDryRun, issueArg));
    } catch (error) {
      results.push({
        team: team.key,
        status: 'blocked',
        stage: 'team-error',
        reason: error.message,
        mutations: 0,
      });
    }
  }
  console.log(
    JSON.stringify(
      {
        schema: 'deterministic-gates/run/v3',
        status: results.some(result => result.status === 'admitted')
          ? 'admitted'
          : results.some(result => result.status === 'would-admit')
            ? 'would-admit'
            : 'blocked',
        teams: results,
        mutations: isDryRun
          ? 0
          : results.some(result => result.mutations === 'verified')
            ? 'verified'
            : 0,
      },
      null,
      2
    )
  );
  deterministicGates.assertNoTeamControllerErrors(results);
}

async function evaluateGateCandidate(
  team,
  selected,
  isDryRun,
  preflight,
  staleLeaseRecovery,
  options = {}
) {
  const client = options.client || linear;
  const checkPreflight = options.preflight || admissionPreflight;
  const collisionPreflight = await checkPreflight(team, selected);
  if (!collisionPreflight.open) {
    return {
      status: 'blocked',
      stage: 'collision-preflight',
      issue: selected.identifier,
      reason: collisionPreflight.reason,
      reasonCode: collisionPreflight.reasonCode,
      disposition: collisionPreflight.disposition,
      active: collisionPreflight.load.identifiers,
      fleetGate: collisionPreflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const plan = deterministicGates.buildDeterministicPlanEvidence(selected);
  const planReason =
    plan.reason || planGate.validatePlanCandidate(selected, plan.evidence);
  if (planReason) {
    return {
      status: 'blocked',
      stage: 'plan',
      issue: selected.identifier,
      reason: planReason,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const researchNeed = researchGate.classifyResearchNeed(selected);
  if (
    researchNeed.decision === 'required' &&
    !researchGate.researchGateReceipt(selected)
  ) {
    return {
      status: 'blocked',
      stage: 'research',
      issue: selected.identifier,
      reason: 'research-evidence-required',
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  if (isDryRun) {
    const contextProbe = await contextGate.collectContextEvidence({
      issue: selected,
      gbrain: cliGbrainClient,
    });
    if (contextProbe.reason) {
      return {
        status: 'blocked',
        stage: 'context',
        issue: selected.identifier,
        reason: contextProbe.reason,
        detail: contextProbe.detail || null,
        fleetGate: preflight.fleetGate,
        staleLeaseRecovery,
        mutations: 0,
      };
    }
    const routing = await approveSymphonyRoute(selected, true, client);
    return {
      status: 'would-admit',
      issue: selected.identifier,
      plan: plan.evidence,
      routing,
      research: researchNeed,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const contextResult = await contextGate.approveContext({
    issue: selected,
    gbrain: cliGbrainClient,
    client,
  });
  if (contextResult.status === 'rejected') {
    return {
      status: 'blocked',
      stage: 'context',
      issue: selected.identifier,
      reason: contextResult.reason,
      detail: contextResult.detail || null,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  let current = await client.fetchIssue(selected.identifier);

  let researchResult;
  if (researchNeed.decision === 'not-required') {
    researchResult = await researchGate.approveResearch({
      issue: current,
      evidence: {
        issue: current.identifier,
        issueHash: contextGate.issueContentHash(current),
        classification: researchNeed.decision,
        rationale: researchNeed.rationale,
        queries: [],
        citations: [],
        findings: [],
        observedAt: new Date().toISOString(),
      },
      client,
    });
  } else {
    const researchReceipt = researchGate.researchGateReceipt(current);
    if (!researchReceipt) {
      researchResult = {
        status: 'rejected',
        reason: 'research-evidence-required',
      };
    } else {
      researchResult = {
        status: 'already-approved',
        fingerprint: researchReceipt.payload.fingerprint,
      };
    }
  }
  if (researchResult.status === 'rejected') {
    return {
      status: 'blocked',
      stage: 'research',
      issue: selected.identifier,
      reason: researchResult.reason,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  current = await client.fetchIssue(selected.identifier);

  const planResult = await planGate.approvePlan({
    issue: current,
    evidence: plan.evidence,
    client,
    teamId: team.id,
  });
  if (planResult.status === 'rejected')
    throw new Error(`plan gate rejected: ${planResult.reason}`);

  current = await client.fetchIssue(selected.identifier);
  const finalPreflight = await checkPreflight(team, current);
  if (!finalPreflight.open)
    throw new Error(`admission preflight blocked: ${finalPreflight.reason}`);

  const routing = await approveSymphonyRoute(current, false, client);
  if (routing.status === 'blocked')
    throw new Error(`symphony routing blocked: ${routing.reason}`);
  current = await client.fetchIssue(selected.identifier);

  const admissionResult = await admissionGate.approveAdmission({
    issue: current,
    client,
    teamId: team.id,
  });
  if (admissionResult.status === 'rejected')
    throw new Error(`admission gate rejected: ${admissionResult.reason}`);

  current = await client.fetchIssue(selected.identifier);
  const classification = {
    ...classifier.classifyDeterministic(current, [current]),
    issue: current,
    ...(options.fingerprint ? { fingerprint: options.fingerprint } : {}),
    labels: current.labels.nodes.map(label => label.name),
  };
  const lease = await admitter.admitIssue({
    issue: current,
    classification,
    client,
    teamId: team.id,
    todoStateId: team.todoStateId,
  });
  if (!['admitted', 'already-admitted'].includes(lease.status))
    throw new Error(`lease rejected: ${lease.reason}`);

  const verified = await client.fetchIssue(selected.identifier);
  const evidence = admitter.hasAdmissionEvidence(verified);
  const load = deterministicGates.admissionIntentLoad([verified]);
  if (verified.state?.name !== 'Todo' || !evidence.eligible || load.count !== 1)
    throw new Error('final gate-and-lease verification failed');

  return {
    status: 'admitted',
    issue: selected.identifier,
    contextGate: contextResult.status,
    contextFingerprint: contextResult.fingerprint,
    researchGate: researchResult.status,
    researchFingerprint: researchResult.fingerprint,
    planGate: planResult.status,
    admissionGate: admissionResult.status,
    lease: lease.status,
    active: load.identifiers,
    fleetGate: finalPreflight.fleetGate,
    staleLeaseRecovery,
    routing,
    mutations: 'verified',
  };
}

/** Existing single-issue pipeline; no pool sweep, stale-lease recovery, or new controller. */
export async function admitShippingLeadRequest(task, options = {}) {
  const profile = shippingTaskProfile(task);
  const team = TEAM_CONFIGS.find(
    candidate => candidate.key === profile?.teamKey
  );
  return gateShippingLeadRequest(task, {
    client: linear,
    preflight: admissionPreflight,
    evaluate: profile?.approvalOnly
      ? (_team, issue, _dryRun, _preflight, _staleLeaseRecovery, gate) =>
          materializeReviewedPlanAdmission({
            task,
            issue,
            client: gate.client,
            teamId: team?.id || null,
          })
      : evaluateGateCandidate,
    team,
    ...options,
  });
}

async function runTeamGateNext(team, isDryRun, issueArg) {
  const staleLeaseRecovery = await recoverStaleLeases(team, isDryRun);
  const preflight = await admissionPreflight(team);
  if (!preflight.open) {
    return {
      team: team.key,
      status: 'blocked',
      stage: 'preflight',
      reason: preflight.reason,
      active: preflight.load.identifiers,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const issues = issueArg
    ? [await linear.fetchIssue(issueArg)].filter(Boolean)
    : await linear.fetchTeamGateCandidates(team.id);
  const holdFile = gateNextHold.resolveIssueHoldFile();
  const holds = gateNextHold.loadIssueHolds(holdFile);
  const result = await gateNextHold.admitNextFromPool({
    issues,
    issueIdentifier: issueArg || null,
    holds,
    isDryRun,
    persistHolds: isDryRun
      ? null
      : nextHolds => gateNextHold.saveIssueHolds(holdFile, nextHolds),
    evaluateCandidate: selected =>
      evaluateGateCandidate(
        team,
        selected,
        isDryRun,
        preflight,
        staleLeaseRecovery
      ),
  });

  return {
    ...result,
    team: team.key,
    fleetGate: result.fleetGate || preflight.fleetGate,
    staleLeaseRecovery: result.staleLeaseRecovery || staleLeaseRecovery,
  };
}

async function runAudit(cache, isDryRun) {
  console.log('Scanning Linear backlog...');
  const teamFetches = await Promise.allSettled(
    TEAM_CONFIGS.map(team => linear.fetchTeamActiveIssues(team.id))
  );
  const allIssues = completeAuditInventory(teamFetches, TEAM_CONFIGS);
  console.log(`Fetched ${allIssues.length} issues`);

  const classifications = [];
  let skipped = 0;

  for (const issue of allIssues) {
    const stored = classifier.parseStoredClassification(issue);
    const c = classifier.classifyDeterministic(issue, allIssues);

    if (stored) {
      c.preexisting = stored;
      // Skip if fingerprint unchanged and strategy hasn't updated
      if (stored.fp === c.fingerprint) {
        c.needsModel = false;
        skipped++;
      }
    }

    classifications.push(c);
  }

  // Bundle workstreams
  const workstreams = workstreamer.bundleWorkstreams(classifications);

  // Generate report
  const report = reporter.generateShadowReport({
    total: allIssues.length,
    classifications,
    workstreams,
    skipped,
  });

  console.log(report);
  console.log('Audit receipt:');
  console.log(
    JSON.stringify(
      {
        schema: 'backlog-orchestrator/audit/v1',
        mode: isDryRun ? 'dry-run' : 'shadow',
        issueCount: allIssues.length,
        inventoryComplete: true,
        eligibility: buildEligibilityCensus(allIssues, classifications),
        triageCount: allIssues.filter(issue => issue.state?.name === 'Triage')
          .length,
        classified: classifications.length,
        skipped,
        wouldMove: classifications.filter(
          c => c.category === 'duplicate' || c.category === 'obsolete'
        ).length,
        mutations: 0,
        note: 'Incidents, follow-ups, duplicates, and agent-ready work route deterministically; only genuine intake remains in Triage.',
      },
      null,
      2
    )
  );

  // Persist report outside the git tree. Same class of dirt as the cache.
  const reportPath = runtimeState.assertsOutsideGitTree(
    runtimeState.resolveReportFile({ orchestratorDir: __dirname }),
    __dirname
  );
  runtimeState.ensureParentDir(reportPath);
  writeFileSync(reportPath, report);
  console.log(`\nReport saved to: ${reportPath}`);
}

async function runReconcile(cache, isDryRun, issueArg) {
  if (issueArg) {
    const issue = await linear.fetchIssue(issueArg);
    if (!issue) {
      console.log(`Issue ${issueArg} not found`);
      return;
    }
    const team = teamForIdentifier(issue.identifier);
    if (!team)
      throw new Error(`Issue ${issue.identifier} has no repository route`);
    console.log('Processing 1 issue');
    const receipt = await reconciler.reconcileIssues({
      issues: [issue],
      client: linear,
      isDryRun,
      backlogStateId: team.backlogStateId,
      todoStateId: team.todoStateId,
    });
    console.log('Reconciliation receipt:');
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.failed > 0) {
      throw new Error('reconcile failed: one or more mutations failed');
    }
    console.log('Reconciliation complete.');
    return;
  }

  console.log('Fetching Triage issues for JOV and LYB...');
  const teamReceipts = [];
  for (const team of TEAM_CONFIGS) {
    try {
      const issues = await linear.fetchTeamTriageIssues(
        team.id,
        1000,
        team.intakeStates
      );
      const receipt = await reconciler.reconcileIssues({
        issues,
        client: linear,
        isDryRun,
        backlogStateId: team.backlogStateId,
        todoStateId: team.todoStateId,
      });
      const remaining = await linear.fetchTeamTriageIssues(
        team.id,
        1000,
        team.intakeStates
      );
      const watchdog = buildAgentReadyTriageWatchdog(remaining);
      teamReceipts.push({
        team: team.key,
        status:
          (isDryRun || watchdog.status === 'healthy') && receipt.failed === 0
            ? 'ok'
            : 'failed',
        ...receipt,
        watchdog,
      });
    } catch (error) {
      teamReceipts.push({
        team: team.key,
        status: 'failed',
        error: error.message,
        issueCount: 0,
        classified: 0,
        skipped: 0,
        wouldMove: 0,
        mutations: 0,
      });
    }
  }
  const totals = teamReceipts.reduce(
    (sum, receipt) => ({
      issueCount: sum.issueCount + receipt.issueCount,
      classified: sum.classified + receipt.classified,
      skipped: sum.skipped + receipt.skipped,
      wouldMove: sum.wouldMove + receipt.wouldMove,
      mutations: sum.mutations + receipt.mutations,
    }),
    { issueCount: 0, classified: 0, skipped: 0, wouldMove: 0, mutations: 0 }
  );
  console.log(`Processing ${totals.issueCount} issues`);
  console.log('Reconciliation receipt:');
  console.log(
    JSON.stringify(
      {
        schema: 'backlog-orchestrator/reconcile-multiteam/v1',
        mode: isDryRun ? 'dry-run' : 'mutating',
        ...totals,
        teams: teamReceipts,
      },
      null,
      2
    )
  );
  console.log('Reconciliation complete.');
  if (teamReceipts.some(receipt => receipt.status === 'failed')) {
    throw new Error(
      'reconcile failed: team error or stalled agent-ready Triage'
    );
  }
}

async function runAdmitNext(cache, isDryRun) {
  console.log('Checking admission eligibility...');
  const teamResults = [];
  for (const team of TEAM_CONFIGS) {
    try {
      teamResults.push(await runTeamAdmitNext(team, isDryRun));
    } catch (error) {
      teamResults.push({
        team: team.key,
        status: 'blocked',
        reason: error.message,
        mutations: 0,
      });
    }
  }

  const result = { teams: teamResults };
  saveCache({
    ...cache,
    lastAdmit: { at: new Date().toISOString(), result },
  });
  return result;
}

async function runTeamAdmitNext(team, isDryRun) {
  const staleLeaseRecovery = await recoverStaleLeases(team, isDryRun);
  console.log(
    `Stale-lease sweep (${staleLeaseRecovery.mode}): recovered ` +
      `${staleLeaseRecovery.recovered.length}, skipped ${staleLeaseRecovery.skipped.length}, ` +
      `failed ${staleLeaseRecovery.failed.length}`
  );

  const allIssues = await linear.fetchTeamActiveIssues(team.id);
  const classifications = [];
  for (const issue of allIssues) {
    const stored = classifier.parseStoredClassification(issue);
    const c = classifier.classifyDeterministic(issue, allIssues);
    if (stored) c.preexisting = stored;
    /** @type {typeof c & { issue: typeof issue }} */ (c).issue = issue;
    classifications.push(c);
  }

  const workstreams = workstreamer.bundleWorkstreams(classifications);

  // Count live leases from the authoritative Linear active-issue snapshot.
  const state = scorer.currentShippingLoad(allIssues);
  const fleetGate = await fleetGateForTeam(team);

  const result = await admitter.selectNextToAdmit(
    classifications,
    workstreams,
    {
      currentlyShipping: state.count,
      fleetGate,
    }
  );

  console.log(`Admission decision: ${result.reason}`);

  if (result.admit.length > 0 && !isDryRun) {
    const item = result.admit[0];
    try {
      item.issue = await linear.fetchIssue(item.identifier);
      const routing = await approveSymphonyRoute(item.issue, false);
      if (routing.status === 'blocked')
        throw new Error(`symphony routing blocked: ${routing.reason}`);
      const receipt = await admitter.admitIssue({
        issue: item.issue,
        classification: item,
        client: linear,
        teamId: team.id,
        todoStateId: team.todoStateId,
      });
      if (['admitted', 'already-admitted'].includes(receipt.status)) {
        console.log(
          `  ${receipt.status}: ${item.identifier} model=${routing.route.model}`
        );
      } else {
        result.admit = [];
        result.admissionFailure = receipt;
        result.reason = `admission rejected: ${receipt.reason}`;
        console.error(
          `  Admission rejected for ${item.identifier}: ${JSON.stringify(receipt)}`
        );
      }
    } catch (err) {
      console.error(
        `  Admission failed for ${item.identifier}: ${err.message}`
      );
      result.admit = [];
      result.reason = `admission failed: ${err.message}`;
    }
  } else if (result.admit.length > 0) {
    console.log('  (dry-run — no mutations performed)');
  }

  return { team: team.key, staleLeaseRecovery, ...result };
}

function uniqueIssuesByIdentifier(issues) {
  const selected = new Map();
  for (const issue of issues) {
    if (issue?.identifier && !selected.has(issue.identifier))
      selected.set(issue.identifier, issue);
  }
  return [...selected.values()];
}

/**
 * The PR inventory is the pullRequests capacity evidence for the remediate
 * receipt. One `gh pr list --json` per state (open + merged) through gh's
 * GraphQL; the rollup + body fields make it the heaviest query in the lane,
 * so each call gets one bounded retry on any failure (transient API hiccup
 * or slow-query overrun) before the inventory fails closed. The two states
 * run in parallel; a state that fails twice leaves the whole inventory null
 * and the capacity gate reports the exact gap (fail-closed, never guessed).
 */
/**
 * The PR inventory query includes `body` and `statusCheckRollup` on ~100
 * open PRs — measured at multiple MB of JSON (the equivalent REST payload
 * is ~1.8MB), far beyond execFile's 1MB default maxBuffer. A maxBuffer
 * overrun kills the child with SIGTERM and a `stdout maxBuffer exceeded`
 * message that names no cause in its truncated form, so the call runs with
 * an explicit 32MB maxBuffer and every failure is described with its exit
 * code, signal, kill flag and untruncated stderr tail.
 */
function describeExecFailure(error, command) {
  const code = typeof error?.code === 'number' ? error.code : null;
  const signal = typeof error?.signal === 'string' ? error.signal : null;
  const killed = error?.killed === true ? 'true' : 'false';
  const message = String(error?.message || error || 'unknown-error');
  const stderrTail = String(error?.stderr || '')
    .trim()
    .slice(-400);
  const messageTail = message.slice(-400);
  return [
    `exit=${code ?? 'none'}`,
    `signal=${signal ?? 'none'}`,
    `killed=${killed}`,
    `stderr=${stderrTail || 'empty'}`,
    `message=${messageTail}`,
  ].join(';');
}

/**
 * The capacity inventory query (JOV-8000 follow-up 7): the live residual
 * failure was GitHub GraphQL 504 (`HTTP 504: 504 Gateway Timeout
 * (https://api.github.com/graphql)`) on the single heavy open-PR query
 * (body + statusCheckRollup on ~100 PRs). Three load reductions, same
 * evidence semantics:
 * - `statusCheckRollup` is dropped: the error-rate signal survives through
 *   `mergeStateStatus: UNSTABLE` (GitHub sets UNSTABLE exactly when
 *   required checks fail; `isErroredPullRequest` already accepts it).
 * - The open list is paginated: two 50-PR pages instead of one 100-PR
 *   GraphQL query, each far under the 504 threshold. `body` stays — the
 *   PR→issue attribution (inventory classifications) reads JOV binds from
 *   PR bodies.
 * - A transient 504/502 gets one extra bounded retry with a short backoff
 *   (server-side timeouts are transient by nature). Any other failure keeps
 *   the existing two attempts; the gate stays fail-closed with the exact
 *   cause named in pullRequestsEvidence.
 */
const GH_TRANSIENT_GATEWAY = /HTTP 50[24]/;

async function ghPullRequestList(state, limit, env) {
  const fields =
    'number,title,body,headRefName,state,mergeStateStatus,mergeable,labels,url,mergedAt,isDraft';
  const args = [
    'pr',
    'list',
    '--repo',
    'JovieInc/Jovie',
    '--state',
    state,
    '--limit',
    String(limit),
    '--json',
    fields,
  ];
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      // Backoff before a retry: a full second for the first retry of a
      // gateway timeout, two for the second.
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
    try {
      const { stdout } = await execFileAsync('gh', args, {
        timeout: 45_000,
        maxBuffer: 32 * 1024 * 1024,
        env,
      });
      return JSON.parse(stdout);
    } catch (error) {
      lastError = error;
      const transient = GH_TRANSIENT_GATEWAY.test(
        String(error?.stderr || '') + String(error?.message || '')
      );
      if (!transient) break;
    }
  }
  throw new Error(
    `gh-pr-list-${state}:${describeExecFailure(lastError, args.join(' '))}`
  );
}

async function ghPullRequestInventory(state, env) {
  // `gh pr list` has no page offset — a second call with the same --limit
  // returns the SAME page, and one --limit 100 call cannot prove
  // completeness past 100 open PRs. The open inventory pages through the
  // REST API (`gh api` with URL query params only — the `gh api graphql -F`
  // form was malformed on the Gem runner's gh CLI: exit=1 "Add a string
  // parameter in key=value format"), ?page=N&per_page=50 until a short
  // page, deduped by number by the caller, so completeness is proven by
  // pagination instead of capped. The merged inventory stays one
  // --limit 50 call (merged PRs are only attribution evidence).
  if (state !== 'open') return ghPullRequestList(state, 50, env);
  const rows = [];
  for (let page = 1; ; page += 1) {
    const path = `repos/JovieInc/Jovie/pulls?state=open&sort=updated&direction=desc&per_page=50&page=${page}`;
    const stdout = await execGhApi(path, env);
    const batch = JSON.parse(stdout);
    if (!Array.isArray(batch)) {
      throw new Error(`gh-pr-list-open:gh-api-rest:non-array-page:${page}`);
    }
    for (const row of batch) {
      // The /pulls LIST payload never includes mergeable/mergeable_state
      // (they are lazily computed per-PR), so no row is marked measured
      // here — mergeStateStatus stays undefined and the mergeability
      // phase (measureMergeability) measures every population row with
      // the per-PR REST GET. mergeabilityUnknown treats unmeasured rows
      // as unknown.
      rows.push({
        number: row.number,
        title: row.title,
        body: row.body,
        headSha: typeof row.head?.sha === 'string' ? row.head.sha : undefined,
        headRefName: row.head?.ref ?? row.headRefName,
        state:
          String(row.state ?? 'OPEN').toUpperCase() === 'MERGED'
            ? 'MERGED'
            : 'OPEN',
        labels: (row.labels ?? []).map(label => ({ name: label.name })),
        url: row.html_url,
        mergedAt: row.merged_at,
        isDraft: row.draft ?? row.isDraft ?? false,
      });
    }
    if (batch.length < 50) break;
  }
  return rows;
}

/**
 * One `gh api` REST call with the transient-gateway retry (the same bounded
 * backoff as ghPullRequestList). URL query params only — no `-F` typed
 * fields (the `gh api graphql -F` form was a CLI usage error on the Gem
 * runner's gh). Any non-transient failure throws with the exact gh cause
 * named.
 */
/**
 * Shared gh CLI executor with the transient-gateway retry. Callers pass the
 * full argv (e.g. ['api', <path>] for REST, ['api', 'graphql', '-f', q] for
 * GraphQL) — never a fused 'graphql -f query=...' endpoint string, which gh
 * reads as one invalid endpoint and fails. `timeoutMs` caps each attempt;
 * the mergeability phase passes its remaining budget so a slow call can
 * never overrun the 20s phase deadline.
 */
async function execGhArgs(args, label, describeAs, env, timeoutMs = 45_000) {
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
    try {
      const { stdout } = await execFileAsync('gh', args, {
        timeout: Math.max(1, timeoutMs),
        maxBuffer: 32 * 1024 * 1024,
        env,
      });
      return stdout;
    } catch (error) {
      lastError = error;
      const transient = GH_TRANSIENT_GATEWAY.test(
        String(error?.stderr || '') + String(error?.message || '')
      );
      if (!transient) break;
    }
  }
  throw new Error(`${label}:${describeExecFailure(lastError, describeAs)}`);
}

async function execGhApi(path, env, timeoutMs) {
  // `gh api` takes NO --repo/-R flag (that is a `gh pr` flag — passing it
  // makes gh exit 1 with its full usage help, whose -F description line
  // "Add a string parameter in key=value format" is what the Gem runner's
  // stderr showed). The repository lives inside the endpoint path itself;
  // the argv is exactly ['api', <full endpoint path+query>].
  return execGhArgs(
    ['api', path],
    'gh-api-pr-inventory',
    `api ${path}`,
    env,
    timeoutMs
  );
}

/**
 * GraphQL read: `gh api graphql -f query=<gql>` as separate argv elements.
 * A response carrying errors[] is a failure (the query itself was rejected),
 * thrown as mergeability-graphql:errors:<msg> so the caller fails closed.
 */
async function execGhGraphql(query, env, timeoutMs) {
  const body = await execGhArgs(
    ['api', 'graphql', '-f', `query=${query}`],
    'gh-api-graphql',
    'api graphql',
    env,
    timeoutMs
  );
  const parsed = JSON.parse(body);
  const errors = parsed?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    throw new Error(
      `mergeability-graphql:errors:${errors
        .map(e => String(e?.message || e).slice(0, 200))
        .join(';')}`.slice(0, 400)
    );
  }
  return parsed;
}

export async function collectGitHubPullRequests(env = process.env) {
  const lists = await Promise.all(
    ['open', 'merged'].map(async state => {
      try {
        return await ghPullRequestInventory(state, env);
      } catch (error) {
        // ghPullRequestList / ghPullRequestInventory already carry the full
        // untruncated failure description; keep the raw message as a
        // fallback if it is ever replaced by a non-Error throw.
        return {
          error:
            error instanceof Error && error.message.startsWith('gh-pr-list-')
              ? error.message
              : `gh-pr-list-${state}:${String(error?.message || error).slice(0, 400)}`,
        };
      }
    })
  );
  const failed = /** @type {{ error?: string }[]} */ (
    lists.filter(list => list && !Array.isArray(list))
  );
  if (failed.length > 0) {
    return {
      error: failed.flatMap(list => list?.error ?? 'unknown').join('|'),
    };
  }
  // The PR inventory is one row per PR number, drafts INCLUDED: the
  // inventory feeds both the capacity rates (which exclude drafts and
  // label-quarantined rows inside pullRequestRates) and the issue→PR
  // attribution (which must see draft PRs too — an issue whose only open
  // PR is a draft still has that PR and must not be re-selected).
  const byNumber = new Map();
  let duplicatesDropped = 0;
  let openUnique = 0;
  for (const row of lists.flat()) {
    const record = /** @type {Record<string, any>} */ (row ?? {});
    if (!Number.isInteger(record.number)) continue;
    if (byNumber.has(record.number)) {
      duplicatesDropped += 1;
      continue;
    }
    byNumber.set(record.number, record);
    if (String(record.state || '').toUpperCase() === 'OPEN') openUnique += 1;
  }
  const inventory = [...byNumber.values()];
  // The open inventory pages through GraphQL with a real cursor, so its
  // completeness is proven by pagination (pageInfo.hasNextPage false) —
  // no page-limit fail-closed is needed for the open side; the merged side
  // is attribution-only evidence (never rate-defining) and a partial merged
  // page cannot silently close the gate.
  return {
    pullRequests: inventory,
    count: inventory.length,
    openUnique,
    duplicatesDropped,
    truncated: false,
  };
}

async function measureCloneLatencyMs() {
  const started = Date.now();
  try {
    await execFileAsync(
      'git',
      ['ls-remote', '--heads', 'https://github.com/JovieInc/Jovie.git', 'main'],
      { timeout: 20_000 }
    );
    return Date.now() - started;
  } catch {
    return null;
  }
}

async function readOfficialSymphonyWorkers(maxConcurrent) {
  try {
    const response = await fetch(
      backlogRemediation.OFFICIAL_SYMPHONY_STATE_URL,
      {
        signal: AbortSignal.timeout(5000),
      }
    );
    if (!response.ok) return null;
    const state = /** @type {{ running?: unknown[], retrying?: unknown[] }} */ (
      await response.json()
    );
    if (!Array.isArray(state?.running) || !Array.isArray(state?.retrying))
      return null;
    return {
      running: state.running.length,
      retrying: state.retrying.length,
      maxConcurrent,
    };
  } catch {
    return null;
  }
}

/**
 * Check-rollup enrichment (JOV-8000 follow-ups 10+15): attaches each
 * rate-population row's check-rollup state from the per-commit REST
 * combined-status view — `gh api repos/.../commits/{sha}/status` keyed by
 * the head SHA the REST inventory already carries (no per-PR lookup, no
 * graphql). The fetches run in bounded-parallelism batches (4 at a time)
 * under a hard deadline so the whole pass stays well inside the remediate
 * step's 90s budget — the sequential form (two calls per row, one row at a
 * time) hit the step timeout and failed the job with exit 124
 * (run 37872694219). Returns false when any fetch fails or the deadline
 * passes — the gate fails closed on prRollups:false, never zero errored.
 */
/**
 * Mergeability measurement (JOV-8000 follow-up 19, Ops spec): the
 * /pulls LIST payload never includes mergeable/mergeable_state (they
 * are lazily computed per-PR), so every population row starts
 * unmeasured. This phase measures each population row with the
 * per-PR REST GET (`gh api repos/JovieInc/Jovie/pulls/<N>`) — the
 * request that triggers GitHub's mergeable computation — mapping
 * mergeable true/false/null to MERGEABLE/CONFLICTING/UNKNOWN and
 * mergeable_state (uppercased) to mergeStateStatus, refreshing
 * headSha. The merge queue is read ONCE up front (GraphQL
 * mergeQueue(branch:"main") entries via a real `gh api graphql -f
 * query=...` argv — never a fused endpoint string) and is the ONLY
 * queue proof: an entry whose headRefOid matches the row's headSha is
 * in-queue, known and not conflicting, with no per-PR retries. The
 * leaked gh-readonly-queue refs carry the merge group's BASE sha (the
 * main tip), not the PR head, so they are dropped as evidence. A
 * GraphQL failure is named in evidence.errors (mergequeue:<cause>) and
 * queueSource 'none', and rows stay unknown (fail closed). The
 * remaining rows poll in ROUNDS: round 0 sends one GET per PR through
 * a 4-wide pool, then later rounds re-poll only the still-null rows
 * after 2s, 4s and 8s; a failed GET is retried in the next round. Each
 * call's timeout is capped at the remaining phase budget under the 20s
 * hard deadline. Fallback: a null-mergeable row with a known
 * mergeable_state is measured — dirty means conflicting; clean,
 * unstable, blocked, behind or has_hooks mean known and not
 * conflicting. Leftovers stay unknown and nothing throws — the gate
 * fails closed on the unknown share. The receipt carries
 * deadlineHit/elapsedMs/unpolled (unknown AND never polled) /
 * queueSource so a starved or queue-blind phase is auditable.
 * @param {Record<string, any>[]} pullRequests
 * @param {NodeJS.ProcessEnv} env
 * @param {{ sleep?: (ms: number) => Promise<void>, now?: () => number }} [timing]
 * @returns {Promise<{measured: number, polls: number, inMergeQueue: number[], stillUnknown: number[], unpolled: number[], deadlineHit: boolean, elapsedMs: number, queueSource: string, errors: string[]}>}
 */
export async function measureMergeability(
  pullRequests,
  env,
  timing = {
    sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
    now: () => Date.now(),
  }
) {
  const sleep =
    timing.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const now = timing.now ?? (() => Date.now());
  const population = pullRequests.filter(isRatePopulationRow);
  const startMs = now();
  const backoffMs = [2000, 4000, 8000];
  const deadline = startMs + 20_000;
  const evidence = {
    measured: 0,
    polls: 0,
    inMergeQueue: [],
    stillUnknown: [],
    unpolled: [],
    deadlineHit: false,
    elapsedMs: 0,
    queueSource: 'none',
    errors: [],
  };

  /** @param {Record<string, any>} row */
  const rowIsUnknown = row =>
    String(row?.mergeable ?? '').toUpperCase() === 'UNKNOWN' ||
    String(row?.mergeable ?? '') === '' ||
    row?.mergeable === undefined ||
    String(row?.mergeStateStatus ?? '').toUpperCase() === 'UNKNOWN' ||
    row?.mergeStateStatus === undefined;

  /** Mark a row as in-queue (the head binding is the caller's job). */
  const markInQueue = row => {
    // In the merge queue: mergeable stays uncomputed by design — known
    // and not conflicting, staying in the denominator. The queue's
    // synthetic merge group is the authority, not the lazily-computed
    // per-PR state.
    row.mergeable = 'MERGEABLE';
    row.mergeStateStatus = 'HAS_HOOKS';
    row.inMergeQueue = true;
    evidence.inMergeQueue.push(Number(row?.number));
  };

  // (A) Merge-queue awareness FIRST, before any per-PR retry: an entry
  // whose headRefOid matches the row's headSha is in-queue — known and
  // not conflicting, no retries spent. GraphQL is the ONLY queue proof:
  // the leaked gh-readonly-queue refs carry the merge group's BASE sha
  // (the main tip), not the PR head, so a head-bound ref match can never
  // pass and refs only exist for groups currently building — they are
  // dropped as evidence. A GraphQL failure is named in evidence.errors
  // (mergequeue:<cause>) and queueSource 'none'; rows stay unknown (fail
  // closed).
  evidence.queueSource = 'none';
  const queueHeadsByPr = new Map();
  try {
    const parsed = await execGhGraphql(
      '{repository(owner:"JovieInc",name:"Jovie"){mergeQueue(branch:"main"){entries(first:100){nodes{pullRequest{number headRefOid}} pageInfo{hasNextPage}}}}}',
      env,
      Math.max(1, deadline - now())
    );
    const entries = parsed?.data?.repository?.mergeQueue?.entries;
    const nodes = entries?.nodes;
    if (!Array.isArray(nodes)) {
      throw new Error('mergeability-graphql:unexpected-response');
    }
    for (const node of nodes) {
      const number = Number(node?.pullRequest?.number);
      const head = String(node?.pullRequest?.headRefOid ?? '');
      if (!Number.isInteger(number) || !/^[0-9a-f]{40}$/.test(head)) continue;
      const heads = queueHeadsByPr.get(number) || new Set();
      heads.add(head);
      queueHeadsByPr.set(number, heads);
    }
    if (entries?.pageInfo?.hasNextPage === true) {
      evidence.errors.unshift('mergequeue:truncated-at-100');
    }
    evidence.queueSource = 'graphql';
  } catch (queueError) {
    evidence.errors.unshift(
      `mergequeue:${String(queueError?.message || queueError).slice(0, 300)}`
    );
    evidence.queueSource = 'none';
  }
  for (const row of population) {
    const queuedHeads = queueHeadsByPr.get(Number(row?.number));
    if (
      queuedHeads &&
      typeof row?.headSha === 'string' &&
      queuedHeads.has(row.headSha)
    ) {
      markInQueue(row);
    }
  }

  /**
   * Apply a per-PR GET result to a row; returns true when the row is
   * measured (known mergeability, or the fallback reads a known
   * mergeable_state), false when still unknown.
   * @param {Record<string, any>} row
   * @param {Record<string, any>} detail
   */
  const applyDetail = (row, detail) => {
    const mergeable = detail?.mergeable;
    if (
      typeof row?.headSha !== 'string' &&
      typeof detail?.head?.sha === 'string'
    ) {
      row.headSha = detail.head.sha;
    }
    if (detail?.mergeable_state !== undefined) {
      row.mergeStateStatus = String(detail.mergeable_state).toUpperCase();
    }
    if (mergeable === true) {
      row.mergeable = 'MERGEABLE';
    } else if (mergeable === false) {
      row.mergeable = 'CONFLICTING';
    }
    if (mergeable === null || mergeable === undefined) {
      // Fallback: null mergeable with a known mergeable_state still
      // measures the row — dirty means conflicting; clean, unstable,
      // blocked, behind or has_hooks mean known and not conflicting.
      const state = String(detail?.mergeable_state ?? '').toUpperCase();
      if (state && state !== 'UNKNOWN') {
        row.mergeable = state === 'DIRTY' ? 'CONFLICTING' : 'MERGEABLE';
        return true;
      }
      return false;
    }
    return true;
  };

  // (B)+(C) Poll in rounds: round 0 sends one GET per row through a
  // 4-wide pool; later rounds re-poll only the still-unknown rows after
  // the 2s/4s/8s backoff. A failed GET no longer gives up — the row
  // rejoins the next round (evidence.errors keeps the named cause).
  // (D) A row is `unpolled` only when it is still unknown AND never got a
  // per-PR GET (deadline-cut before round 0 reached it) — a polled-null
  // row is stillUnknown but NOT unpolled.
  const pending = population.filter(row => rowIsUnknown(row));
  const polled = new Set();
  const getOnce = async row => {
    if (now() > deadline) return;
    try {
      const body = await execGhApi(
        `repos/JovieInc/Jovie/pulls/${row.number}`,
        env,
        Math.max(1, deadline - now())
      );
      evidence.polls += 1;
      const detail = /** @type {Record<string, any>} */ (JSON.parse(body));
      applyDetail(row, detail);
    } catch (error) {
      if (evidence.errors.length < 5) {
        evidence.errors.push(
          `pulls/${row.number}:${describeExecFailure(error, 'api')}`
        );
      }
    } finally {
      polled.add(row);
    }
  };
  for (
    let round = 0;
    round <= backoffMs.length && pending.length > 0;
    round += 1
  ) {
    if (now() > deadline) {
      evidence.deadlineHit = true;
      break;
    }
    if (round > 0) {
      const wait = backoffMs[round - 1];
      if (now() + wait > deadline) {
        evidence.deadlineHit = true;
        break;
      }
      await sleep(wait);
      if (now() > deadline) {
        evidence.deadlineHit = true;
        break;
      }
    }
    const roundRows = pending.splice(0, pending.length);
    for (let i = 0; i < roundRows.length; i += 4) {
      if (now() > deadline) {
        evidence.deadlineHit = true;
        // Rows not reached this round rejoin pending so unpolled is exact.
        pending.push(...roundRows.slice(i));
        break;
      }
      const batch = roundRows.slice(i, i + 4);
      await Promise.all(batch.map(row => getOnce(row)));
    }
    for (const row of roundRows) {
      if (rowIsUnknown(row) && !pending.includes(row)) pending.push(row);
    }
  }
  evidence.unpolled = pending
    .filter(row => rowIsUnknown(row) && !polled.has(row))
    .map(row => row?.number);

  evidence.measured = population.filter(row => !rowIsUnknown(row)).length;
  evidence.stillUnknown = population
    .filter(row => rowIsUnknown(row))
    .map(row => row?.number);
  evidence.elapsedMs = Math.max(0, now() - startMs);
  return evidence;
}

export function isRatePopulationRow(pullRequest) {
  // Population = every counted row (open, non-draft, not
  // label-quarantined) — the same predicate as pullRequestRates.
  return (
    String(pullRequest?.state || '').toUpperCase() === 'OPEN' &&
    pullRequest?.isDraft !== true &&
    !(pullRequest?.labels ?? []).some(label =>
      ['queue-poison', 'hold'].includes(
        String(
          typeof label === 'string'
            ? label
            : /** @type {any} */ (label?.name ?? '')
        ).toLowerCase()
      )
    )
  );
}

export async function attachCheckRollups(pullRequests, env = process.env) {
  const counted = pullRequests.filter(isRatePopulationRow);
  const rollupRows = counted.filter(row => typeof row?.headSha === 'string');
  let prRollups = true;
  const rollupDeadline = Date.now() + 25_000;
  for (let i = 0; i < rollupRows.length; i += 4) {
    if (Date.now() > rollupDeadline) {
      // A slow runner fails the gate closed on the named cause instead of
      // timing out the remediate step (the 124 exit class).
      prRollups = false;
      break;
    }
    const batch = rollupRows.slice(i, i + 4);
    await Promise.all(
      batch.map(async row => {
        try {
          // JOV-8000 follow-up 20b: the error gate reads the Actions
          // CHECK-RUNS view — `commits/{sha}/check-runs` — not the legacy
          // status view (`commits/{sha}/status`), which only aggregates
          // legacy commit statuses and reads 'success' for PRs whose
          // failing CI is Actions check-runs (unstable rows read clean).
          // A row is errored when ANY check-run on its head concluded
          // FAILURE (isErroredPullRequest reads statusCheckRollup.state
          // FAILURE/ERROR); otherwise SUCCESS. No threshold change.
          const body = await execGhApi(
            `repos/JovieInc/Jovie/commits/${row.headSha}/check-runs?per_page=100`,
            env
          );
          const checkRuns = JSON.parse(body);
          const runs = Array.isArray(checkRuns?.check_runs)
            ? checkRuns.check_runs
            : [];
          const anyFailure = runs.some(
            run => String(run?.conclusion ?? '').toUpperCase() === 'FAILURE'
          );
          row.statusCheckRollup = { state: anyFailure ? 'FAILURE' : 'SUCCESS' };
        } catch {
          prRollups = false;
        }
      })
    );
  }
  return prRollups;
}

async function runRemediate(isDryRun) {
  const team = TEAM_CONFIGS.find(item => item.key === 'JOV');
  if (!team) throw new Error('jov-team-config-missing');
  const [intake, active] = await Promise.all([
    linear.fetchTeamGateCandidates(team.id),
    linear.fetchTeamActiveIssues(team.id),
  ]);
  const issues = uniqueIssuesByIdentifier([...intake, ...active]);
  // The collector returns either a full inventory receipt
  // ({pullRequests, count, openUnique, duplicatesDropped, truncated:false})
  // or a failed-closed receipt ({error, truncated?, ...}) — never a bare
  // array and never a silent truncation.
  const pullRequestsReceipt = await collectGitHubPullRequests();
  const pullRequests = Array.isArray(
    /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})?.pullRequests
  )
    ? /** @type {Record<string, any>} */ (pullRequestsReceipt).pullRequests
    : null;
  // Mergeability measurement (JOV-8000 follow-up 19, Ops spec): the
  // /pulls LIST payload never carries mergeable/mergeable_state, so every
  // population row starts unmeasured. measureMergeability runs the per-PR
  // REST GET per row (which triggers GitHub's computation), bounded-parallel
  // with retries and a hard deadline; merge-queue rows (still null after
  // retries with a gh-readonly-queue pr-<N>- ref) count as known and not
  // conflicting. The receipt carries the full evidence.
  let mergeabilityEvidence = null;
  if (Array.isArray(pullRequests)) {
    mergeabilityEvidence = await measureMergeability(
      pullRequests,
      process.env,
      {
        sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
        now: () => Date.now(),
      }
    );
  }
  // Check-rollup fetch (JOV-8000 follow-up 10): the error gate reads each
  // rate-population row's check-rollup STATE (FAILURE/ERROR = a failing
  // required check on the head), which the inventory query does not carry.
  // On failure the gate fails closed with 'pr-check-rollup-unavailable' via
  // the prRollups:false signal — never treated as zero errored.
  const prRollups = Array.isArray(pullRequests)
    ? await attachCheckRollups(pullRequests, process.env)
    : true;
  const cloneLatencyMs = await measureCloneLatencyMs();
  const fleetGate = await fleetGateForTeam(team);
  const loadedReceipt = loadFleetGateReceipt(team);
  const rawReceipt = loadedReceipt?.receipt ?? null;
  const queue = rawReceipt?.signals?.queue;
  // JOV-8000: the Elixir :4041 state API is retired. The shipping lanes'
  // doctor report is the measured capacity source; the legacy read survives
  // only as a fallback so a future controller can re-own the signal.
  const lanes = backlogRemediation.readLanesCapacity();
  const rotateProvider = () => {
    const rotate = readCodexRotateCapacity();
    return rotate ? { accounts: rotate.accounts, ready: rotate.ready } : null;
  };
  const workers = lanes
    ? lanes.workers
    : await readOfficialSymphonyWorkers(
        fleetGate.concurrency?.gem?.maxConcurrent
      );
  // The lanes doctor owns worker seats, but its codex attribution can be
  // unknown (status-probe error) while the report itself is fresh — the same
  // codex-rotate account evidence backs the provider signal in that case,
  // so one stale sub-signal cannot blank the whole capacity receipt.
  const provider = (lanes && lanes.provider) || rotateProvider();
  const previous = loadCache().backlogRemediation || {};
  const receipt = backlogRemediation.buildRemediationReceipt({
    issues,
    pullRequests: Array.isArray(pullRequests) ? pullRequests : [],
    mainSha: rawReceipt?.signals?.main?.sha || null,
    capacitySignals: {
      schema: backlogRemediation.CAPACITY_SCHEMA,
      observedAt: new Date().toISOString(),
      workers,
      host: backlogRemediation.readHostPressure('/proc'),
      provider: provider
        ? { accounts: provider.accounts, ready: provider.ready }
        : null,
      prRollups,
      cloneLatencyMs,
      ci: {
        saturating:
          Number.isInteger(queue?.greenReadyPrs) &&
          Number.isInteger(queue?.target) &&
          queue.greenReadyPrs >= queue.target,
        running: Number.isInteger(queue?.greenReadyPrs)
          ? queue.greenReadyPrs
          : null,
        queued: Number.isInteger(queue?.eligiblePrs) ? queue.eligiblePrs : null,
      },
      pullRequests,
      // JOV-8000 follow-up 19: the mergeability measurement evidence rides
      // the capacity signals (measured/polls/inMergeQueue/stillUnknown/
      // errors) so the receipt is auditable against the live fleet.
      mergeabilityEvidence,
      mergeQueue: {
        health:
          fleetGate.promotionMode === admitter.FLEET_PROMOTION_MODE.BLOCKED
            ? 'blocked'
            : fleetGate.state === admitter.FLEET_GATE_STATE.GREEN
              ? 'healthy'
              : 'degraded',
        entries: Number.isInteger(queue?.eligiblePrs)
          ? queue.eligiblePrs
          : null,
      },
    },
    previousCleanStreak: previous.cleanStreak || 0,
    previousCohortSize: previous.cohortSize || 0,
  });
  const result = {
    ...receipt,
    mode: isDryRun ? 'dry-run' : 'mutating',
    workpad: undefined,
    workpadBody: receipt.workpad,
    // JOV-8000 follow-up 33: which receipt the capacity verdict derived from
    // (same-run file vs host-persisted latest.json) and whether the
    // receipt's own printed promotionMode matched the derived one.
    fleetGateEvidence: fleetGate.fleetGateEvidence ?? null,
    // The pullRequests capacity evidence keeps failing closed inside the
    // capacity verdict; the exact gh failure and the inventory audit
    // numbers are surfaced here so a capacity-evidence gap names its
    // producer. Access stays property-safe across the collector's return
    // shapes.
    pullRequestsEvidence: Array.isArray(pullRequests)
      ? {
          count:
            /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})
              ?.count ?? pullRequests.length,
          openUnique:
            /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})
              ?.openUnique ?? null,
          duplicatesDropped:
            /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})
              ?.duplicatesDropped ?? null,
          truncated: false,
          error: null,
        }
      : {
          count:
            /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})
              ?.count ?? null,
          truncated: Boolean(
            /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})
              ?.truncated
          ),
          error: String(
            /** @type {Record<string, any>} */ (pullRequestsReceipt ?? {})
              ?.error ??
              (pullRequests === null
                ? 'gh-pr-list:unparseable-output'
                : 'gh-pr-list:unknown-failure')
          ).slice(0, 2000),
        },
    feed: receipt.feed,
    workpadUpsert: null,
    // JOV-8000 follow-up 36: the mergeability evidence also rides the
    // printed result top-level (it already sits inside
    // capacitySignals.mergeabilityEvidence) so the deadline/starvation
    // fields are one property away from the receipt reader.
    mergeabilityEvidence,
  };
  if (!isDryRun) {
    result.workpadUpsert = await backlogRemediation.upsertRemediationWorkpad({
      client: linear,
      workpadIssue:
        TEAM_FILE_CONFIG.remediation?.workpadIssue ||
        backlogRemediation.DEFAULT_WORKPAD_ISSUE,
      receipt,
    });
    // Selected-to-lanes bridge (Symphony Owner, 2026-10-10): convert each
    // selected issue into a leasable one (add the shared agent-ready label +
    // a one-time bridge marker) so a lane's claim-scan picks it up. Runs only
    // in the mutating path, after the workpad upsert; the kill-switch env
    // JOVIE_BRIDGE_LANES=0|false|off disables it. Linear-budget friendly: one
    // fetch + at most one write per selected issue.
    const bridgeInventory = Object.fromEntries(
      (receipt.matrix ?? [])
        .filter(row => row?.identifier)
        .map(row => [row.identifier, { openPullRequests: [] }])
    );
    result.bridge = await backlogRemediation.bridgeSelectedToLanes({
      cohort: receipt.cohort,
      client: linear,
      inventory: bridgeInventory,
      teamId: team.id,
      env: process.env,
    });
    if (receipt.cohort.selected.length > 0) {
      // JOV-8000: the lanes pick up admitted work on their own event-driven
      // tick — there is no HTTP refresh endpoint to POST anymore. Passing no
      // URL records an event-driven feed receipt instead of failing remediate
      // on a dead connection.
      result.feed = {
        ...receipt.feed,
        refresh: await backlogRemediation.feedOfficialSymphony({ url: null }),
      };
    }
    const clean = receipt.capacity.allowed === true;
    saveCache({
      ...loadCache(),
      backlogRemediation: {
        fingerprint: receipt.fingerprint,
        cleanStreak: clean ? (previous.cleanStreak || 0) + 1 : 0,
        cohortSize: receipt.capacity.cohortSize,
        observedAt: receipt.observedAt,
      },
    });
  }
  console.log(JSON.stringify(result, null, 2));
  // One-line capacity.rates summary as the LAST log line (JOV-8000
  // follow-up 19): the full receipt block sits ~300KB above the end of a
  // ~1.45MB log — the summary lands the auditable numbers at the tail.
  const ratesSummary = Array.isArray(pullRequests)
    ? backlogRemediation.pullRequestRates(pullRequests)
    : null;
  if (ratesSummary) {
    const mm = mergeabilityEvidence ?? {};
    console.log(
      `capacity.rates total=${ratesSummary.total} conflicting=${ratesSummary.conflicting}(${ratesSummary.conflictingPullRequests.join(',')}) errored=${ratesSummary.errored}(${ratesSummary.erroredPullRequests.join(',')}) unknown=${ratesSummary.unknown}(${ratesSummary.unknownPullRequests.join(',')}) unknownRate=${ratesSummary.unknownRate.toFixed(3)} conflictRate=${ratesSummary.conflictRate.toFixed(3)} errorRate=${ratesSummary.errorRate.toFixed(3)} allowed=${result?.capacity?.allowed === true} selected=${result?.capacity?.cohortSize ?? 0} reason=${result?.capacity?.reason ?? 'none'} mm.measured=${mm.measured ?? 0} mm.polls=${mm.polls ?? 0} mm.inMergeQueue=${(mm.inMergeQueue ?? []).length} mm.deadlineHit=${mm.deadlineHit === true} mm.elapsedMs=${mm.elapsedMs ?? 0} mm.unpolled=${(mm.unpolled ?? []).join(',')} mm.queueSource=${mm.queueSource ?? 'none'} mm.errors=${(mm.errors ?? []).length}`
    );
  }
}

if (
  process.argv[1] &&
  existsSync(process.argv[1]) &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  main().catch(err => {
    const cooldown = linear.activeLinearCooldown(err);
    const deferred = process.argv[2] === 'remediate' && cooldown !== null;
    const receipt = {
      schema: 'backlog-orchestrator/failure/v1',
      status: deferred ? 'deferred' : 'blocked',
      code: deferred ? 'RATE_LIMITED' : err.code || 'UNKNOWN',
      attempts: err.attempts,
      message: err.message,
      ...(deferred ? cooldown : {}),
    };
    console.error('Failure receipt:', JSON.stringify(receipt));
    if (deferred) {
      console.error(
        `Linear credential cooldown is active; the scheduled remediation clock will retry at or after ${receipt.retryAt}.`
      );
      process.exitCode = 0;
      return;
    }
    console.error('Fatal error:', err);
    process.exitCode = 1;
  });
