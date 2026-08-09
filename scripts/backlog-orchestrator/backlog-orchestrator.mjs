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
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs admit-next
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs gate-next
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs approve-plan --issue=JOV-123 --evidence-file=/path/evidence.json
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs report
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import * as admissionDisposition from './admission-disposition.mjs';
import * as admissionGate from './admission-gate.mjs';
// Keep the complete control-plane dependency closure visible to source sync and
// module tooling. These are canonical sibling modules, not host-only copies.
import * as admitter from './admitter.mjs';
import * as classifier from './classifier.mjs';
import * as deterministicGates from './deterministic-gates.mjs';
import * as linear from './linear-client.mjs';
import * as planGate from './plan-gate.mjs';
import * as reconciler from './reconcile.mjs';
import * as reporter from './reporter.mjs';
import * as scorer from './scorer.mjs';
import * as staleLeaseGuard from './stale-lease-guard.mjs';
import * as workstreamer from './workstreamer.mjs';

// ----- Config -----
const CACHE_FILE = resolve(__dirname, '.orchestrator-cache.json');
const ADMISSION_STATE_DIR =
  process.env.BACKLOG_ORCHESTRATOR_STATE_DIR ||
  resolve(
    process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
    'state/backlog-orchestrator'
  );
const ADMISSION_HISTORY_FILE = resolve(
  ADMISSION_STATE_DIR,
  'admission-history.json'
);
const ADMISSION_SCAN_FILE = resolve(ADMISSION_STATE_DIR, 'latest.json');
const ADMISSION_HISTORY_SCHEMA = 'symphony-admission-history/v1';
const ADMISSION_RUN_SCHEMA = 'symphony-admission-run/v1';
const ADMISSION_CANDIDATE_BUDGET = Math.min(
  8,
  Math.max(
    1,
    Number.parseInt(
      process.env.SYMPHONY_ADMISSION_CANDIDATE_BUDGET || '4',
      10
    ) || 4
  )
);
const FLEET_GATE_RECEIPT_FILE =
  process.env.JOVIE_FLEET_GATE_RECEIPT ||
  resolve(
    process.env.GEM_WORKSPACE || '/home/timwhite/gem-workspace',
    'state/gem-priority-gate/latest.json'
  );

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
  writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

function atomicWriteJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, path);
}

export function parseAdmissionHistory(value) {
  const state = typeof value === 'string' ? JSON.parse(value) : value;
  if (state?.schema !== ADMISSION_HISTORY_SCHEMA || !state?.teams)
    throw new Error('invalid-admission-history');
  return state;
}

function loadAdmissionHistory() {
  try {
    return parseAdmissionHistory(readFileSync(ADMISSION_HISTORY_FILE, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT')
      throw new Error('admission-history-unreadable', { cause: error });
    return { schema: ADMISSION_HISTORY_SCHEMA, teams: {} };
  }
}

function saveAdmissionHistory(state) {
  atomicWriteJson(ADMISSION_HISTORY_FILE, state);
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
  node backlog-orchestrator.mjs admit-next            Admit next work item
  node backlog-orchestrator.mjs gate-next             Plan, approve, and admit one safe issue
  node backlog-orchestrator.mjs gate-next --dry-run   Show the next issue without mutations
  node backlog-orchestrator.mjs approve-plan --issue=JOV-123 --evidence-file=/path/evidence.json
  node backlog-orchestrator.mjs report                Generate shadow report
`);
    return;
  }

  const cache = loadCache();

  if (command === 'audit' || command === 'report') {
    await runAudit(cache, isDryRun);
  } else if (command === 'reconcile') {
    await runReconcile(cache, isDryRun, issueArg);
  } else if (command === 'admit-next') {
    await runAdmitNext(cache, isDryRun);
  } else if (command === 'gate-next') {
    await runGateNext(isDryRun, issueArg, loadAdmissionHistory());
  } else if (command === 'approve-plan') {
    await runApprovePlan(issueArg, evidenceFile, evidenceJson, isDryRun);
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
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

async function isTeamProductionRed(team) {
  try {
    const response = await fetch(team.healthUrl, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return true;
    if (team.healthKind === 'json-status') {
      const data = /** @type {{ status?: string }} */ (await response.json());
      return data.status !== 'ok';
    }
    return false;
  } catch {
    return true;
  }
}

function loadFleetGateReceipt(team) {
  if (team.key !== 'JOV') return null;
  try {
    const receipt = JSON.parse(readFileSync(FLEET_GATE_RECEIPT_FILE, 'utf8'));
    return receipt?.schema === admitter.FLEET_GATE_SCHEMA &&
      receipt?.signals &&
      typeof receipt.signals === 'object'
      ? receipt
      : null;
  } catch {
    return null;
  }
}

async function fleetGateForTeam(team, now = new Date().toISOString()) {
  const productionRed = await isTeamProductionRed(team);
  const receipt = loadFleetGateReceipt(team);
  const receiptMain = receipt?.signals?.main?.status;
  return admitter.evaluateFleetGate(
    {
      main: {
        status:
          productionRed || receiptMain === 'red'
            ? 'red'
            : receiptMain === 'green'
              ? 'green'
              : 'unknown',
      },
      controller: {
        status: receipt?.signals?.controller?.status || 'unknown',
      },
      integrity: receipt?.signals?.integrity || { status: 'clear' },
      queue: receipt?.signals?.queue,
      concurrencyEvidence: receipt?.signals?.concurrencyEvidence,
      observedAt: receipt?.observedAt,
    },
    { now }
  );
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

async function admissionPreflight(team) {
  const fleetGate = await fleetGateForTeam(team);
  if (!fleetGate.workAdmission.allowed) {
    return {
      open: false,
      reason: `fleet gate ${fleetGate.state.toLowerCase()} blocks pickup`,
      load: { count: 0, identifiers: [] },
      fleetGate,
    };
  }
  const symphonyIssues = await linear.fetchTeamSymphonyIssues(team.id);
  const load = deterministicGates.admissionIntentLoad(symphonyIssues);
  const maxConcurrentShipping = admitter.maxConcurrentShippingForTeam(team.key);
  return {
    open: load.count < maxConcurrentShipping,
    reason:
      load.count < maxConcurrentShipping
        ? 'open'
        : `at capacity (${load.count}/${maxConcurrentShipping})`,
    load,
    fleetGate,
  };
}

function incompleteAdmissionScan(error, now) {
  return {
    schema: admissionDisposition.ADMISSION_SCAN_SCHEMA,
    status: 'incomplete',
    generatedAt: now,
    coverage: {
      complete: false,
      ...(error?.coverage || {}),
      reason: error?.coverage?.reason || error?.code || 'transport-failed',
      transportCode: error?.cause?.code || error?.code || 'UNKNOWN',
      attempts: error?.cause?.attempts || error?.attempts || null,
    },
    counts: null,
    dispositions: [],
    retry: {
      automatic: true,
      mode: 'restart-exhaustive-from-null',
      trigger: 'next-scheduled-gate-run',
    },
  };
}

export function admissionRunReceipt(results, isDryRun, generatedAt) {
  const scans = results.map(result => result.admissionScan).filter(Boolean);
  const complete =
    scans.length === results.length &&
    scans.every(scan => scan.coverage?.complete === true && scan.counts);
  const counts = scans.reduce(
    (sum, scan) => {
      if (!scan.counts) return sum;
      for (const key of [
        'totalEvaluated',
        'eligible',
        'queued',
        'claimed',
        'deferred',
        'rejected',
        'unclassified',
      ])
        sum[key] += scan.counts[key];
      return sum;
    },
    {
      totalEvaluated: 0,
      eligible: 0,
      queued: 0,
      claimed: 0,
      deferred: 0,
      rejected: 0,
      unclassified: 0,
    }
  );
  const classified =
    counts.eligible +
    counts.queued +
    counts.claimed +
    counts.deferred +
    counts.rejected;
  const retryNeeded =
    !complete ||
    results.some(result =>
      ['candidate-budget', 'team-error', 'transport'].includes(result.stage)
    );
  return {
    schema: ADMISSION_RUN_SCHEMA,
    generatedAt,
    mode: isDryRun ? 'dry-run' : 'mutating',
    status: results.some(result => result.status === 'admitted')
      ? 'admitted'
      : results.some(result => result.status === 'would-admit')
        ? 'would-admit'
        : complete
          ? 'evaluated'
          : 'incomplete',
    coverage: { complete, teamCount: results.length },
    counts,
    invariant: {
      classifiedSum: classified,
      matchesTotal: complete && classified === counts.totalEvaluated,
      unclassifiedZero: complete && counts.unclassified === 0,
    },
    retry: {
      automatic: retryNeeded,
      mode: !complete
        ? 'restart-exhaustive-from-null'
        : retryNeeded
          ? 'resume-after-candidate-backoff'
          : 'not-needed',
      trigger: retryNeeded ? 'next-scheduled-gate-run' : null,
    },
    teams: results,
    mutations: isDryRun
      ? 0
      : results.some(result => result.mutations === 'verified')
        ? 'verified'
        : 0,
  };
}

function isLinearTransportFailure(error) {
  return (
    error instanceof linear.LinearTransportError ||
    error instanceof linear.LinearPaginationError ||
    ['AUTH', 'HTTP', 'NETWORK', 'RATE_LIMITED', 'SERVER', 'TIMEOUT'].includes(
      error?.code
    )
  );
}

function storeTeamHistory(state, teamKey, history) {
  state.teams = { ...state.teams, [teamKey]: history };
  saveAdmissionHistory(state);
}

async function runGateNext(isDryRun, issueArg, admissionHistory) {
  const teams = issueArg
    ? [teamForIdentifier(issueArg)].filter(Boolean)
    : TEAM_CONFIGS;
  if (teams.length === 0)
    throw new Error(`Issue ${issueArg} has no repository route`);
  const results = [];
  for (const team of teams) {
    try {
      results.push(
        await runTeamGateNext(team, isDryRun, issueArg, admissionHistory)
      );
    } catch (error) {
      results.push({
        team: team.key,
        status: 'blocked',
        stage: 'team-error',
        reason: error.message,
        admissionScan: incompleteAdmissionScan(error, new Date().toISOString()),
        mutations: 0,
      });
    }
  }
  const receipt = admissionRunReceipt(
    results,
    isDryRun,
    new Date().toISOString()
  );
  if (!isDryRun) atomicWriteJson(ADMISSION_SCAN_FILE, receipt);
  console.log(JSON.stringify(receipt, null, 2));
}

async function runTeamGateNext(team, isDryRun, issueArg, admissionHistory) {
  const now = new Date().toISOString();
  let snapshot;
  try {
    snapshot = await linear.fetchTeamActiveIssueSnapshot(team.id);
  } catch (error) {
    return {
      team: team.key,
      status: 'blocked',
      stage: 'coverage',
      reason: error.message,
      admissionScan: incompleteAdmissionScan(error, now),
      mutations: 0,
    };
  }
  let history = admissionHistory.teams?.[team.key] || {};
  const scanOptions = { now, historyByIdentifier: history };
  const buildScan = () => {
    const scan = admissionDisposition.buildAdmissionScan(
      snapshot.issues,
      scanOptions
    );
    return {
      ...scan,
      coverage: {
        ...scan.coverage,
        complete: scan.coverage.complete && snapshot.coverage.complete === true,
        transport: snapshot.coverage,
      },
    };
  };
  let admissionScan = buildScan();
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
      admissionScan,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const issuesByIdentifier = new Map(
    snapshot.issues.map(issue => [issue.identifier, issue])
  );
  const eligible = admissionDisposition
    .eligibleOrder(admissionScan)
    .filter(item => !issueArg || item.identifier === issueArg);
  if (eligible.length === 0) {
    return {
      team: team.key,
      status: 'blocked',
      stage: 'selection',
      reason: issueArg
        ? 'requested issue is not eligible'
        : 'no eligible issue',
      fleetGate: preflight.fleetGate,
      admissionScan,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  if (isDryRun) {
    const selected = issuesByIdentifier.get(eligible[0].identifier);
    const plan = deterministicGates.buildDeterministicPlanEvidence(selected);
    return {
      team: team.key,
      status: 'would-admit',
      issue: selected.identifier,
      plan: plan.evidence,
      fleetGate: preflight.fleetGate,
      admissionScan,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const attempts = [];
  for (const candidate of eligible.slice(0, ADMISSION_CANDIDATE_BUDGET)) {
    const selected = issuesByIdentifier.get(candidate.identifier);
    try {
      const plan = deterministicGates.buildDeterministicPlanEvidence(selected);
      const planReason =
        plan.reason || planGate.validatePlanCandidate(selected, plan.evidence);
      if (planReason) throw new Error(`plan rejected: ${planReason}`);
      const planResult = await planGate.approvePlan({
        issue: selected,
        evidence: plan.evidence,
        client: linear,
        teamId: team.id,
      });
      if (planResult.status === 'rejected')
        throw new Error(`plan gate rejected: ${planResult.reason}`);

      let current = await linear.fetchIssue(selected.identifier);
      const finalPreflight = await admissionPreflight(team);
      if (!finalPreflight.open)
        return {
          team: team.key,
          status: 'blocked',
          stage: 'final-preflight',
          reason: finalPreflight.reason,
          fleetGate: finalPreflight.fleetGate,
          admissionScan,
          staleLeaseRecovery,
          attempts,
          mutations: 0,
        };
      const admissionResult = await admissionGate.approveAdmission({
        issue: current,
        client: linear,
        teamId: team.id,
      });
      if (admissionResult.status === 'rejected')
        throw new Error(`admission gate rejected: ${admissionResult.reason}`);

      current = await linear.fetchIssue(selected.identifier);
      const classification = {
        ...classifier.classifyDeterministic(current, [current]),
        issue: current,
        labels: current.labels.nodes.map(label => label.name),
      };
      const lease = await admitter.admitIssue({
        issue: current,
        classification,
        client: linear,
        teamId: team.id,
        todoStateId: team.todoStateId,
      });
      if (!['admitted', 'already-admitted'].includes(lease.status))
        throw new Error(`lease rejected: ${lease.reason}`);

      const verified = await linear.fetchIssue(selected.identifier);
      const evidence = admitter.hasAdmissionEvidence(verified);
      const load = deterministicGates.admissionIntentLoad([verified]);
      if (
        verified.state?.name !== 'Todo' ||
        !evidence.eligible ||
        !verified.labels.nodes.some(
          label => label.name === admitter.SYMPHONY_LABEL
        ) ||
        load.count !== 1
      )
        throw new Error('final gate-and-lease verification failed');

      history = admissionDisposition.clearAdmissionFailure(
        history,
        selected.identifier,
        { now: new Date().toISOString() }
      );
      storeTeamHistory(admissionHistory, team.key, history);
      return {
        team: team.key,
        status: 'admitted',
        issue: selected.identifier,
        planGate: planResult.status,
        admissionGate: admissionResult.status,
        lease: lease.status,
        active: load.identifiers,
        fleetGate: finalPreflight.fleetGate,
        admissionScan,
        staleLeaseRecovery,
        attempts,
        mutations: 'verified',
      };
    } catch (error) {
      if (isLinearTransportFailure(error))
        return {
          team: team.key,
          status: 'blocked',
          stage: 'transport',
          reason: error.message,
          fleetGate: preflight.fleetGate,
          admissionScan,
          staleLeaseRecovery,
          attempts,
          mutations: 0,
        };
      history = admissionDisposition.recordAdmissionFailure(
        history,
        selected.identifier,
        { now: new Date().toISOString(), reason: error.message }
      );
      storeTeamHistory(admissionHistory, team.key, history);
      attempts.push({
        issue: selected.identifier,
        status: 'deferred',
        reason: 'candidate-attempt-failed',
        detail: error.message,
      });
    }
  }

  admissionScan = (() => {
    scanOptions.historyByIdentifier = history;
    return buildScan();
  })();
  return {
    team: team.key,
    status: 'blocked',
    stage: 'candidate-budget',
    reason: 'eligible candidates exhausted after isolated failures',
    fleetGate: preflight.fleetGate,
    admissionScan,
    staleLeaseRecovery,
    attempts,
    mutations: 0,
  };
}

async function runAudit(cache, isDryRun) {
  console.log('Scanning Linear backlog...');
  const teamSnapshots = await Promise.all(
    TEAM_CONFIGS.map(async team => ({
      team,
      snapshot: await linear.fetchTeamActiveIssueSnapshot(team.id),
    }))
  );
  const allIssues = teamSnapshots.flatMap(result => result.snapshot.issues);
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
        continue;
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
        coverage: {
          complete: true,
          teams: teamSnapshots.map(({ team, snapshot }) => ({
            team: team.key,
            ...snapshot.coverage,
          })),
        },
        triageCount: allIssues.filter(issue => issue.state?.name === 'Triage')
          .length,
        classified: classifications.length,
        skipped,
        wouldMove: classifications.filter(
          c => c.category === 'duplicate' || c.category === 'obsolete'
        ).length,
        mutations: 0,
        note: 'Triageable issues intentionally remain in Triage; only duplicate/obsolete classifications are move candidates.',
      },
      null,
      2
    )
  );

  // Persist report
  const reportPath = resolve(__dirname, 'shadow-report-latest.txt');
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
    });
    console.log('Reconciliation receipt:');
    console.log(JSON.stringify(receipt, null, 2));
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
      });
      teamReceipts.push({ team: team.key, status: 'ok', ...receipt });
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
      maxConcurrentShipping: admitter.maxConcurrentShippingForTeam(team.key),
    }
  );

  console.log(`Admission decision: ${result.reason}`);

  if (result.admit.length > 0 && !isDryRun) {
    const item = result.admit[0];
    try {
      const receipt = await admitter.admitIssue({
        issue: item.issue,
        classification: item,
        client: linear,
        teamId: team.id,
        todoStateId: team.todoStateId,
      });
      console.log(`  ${receipt.status}: ${item.identifier}`);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error(
      'Failure receipt:',
      JSON.stringify({
        schema: 'backlog-orchestrator/failure/v1',
        status: 'blocked',
        code: err.code || 'UNKNOWN',
        attempts: err.attempts,
        message: err.message,
        coverage: err.coverage,
      })
    );
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
