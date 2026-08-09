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

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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
    await runGateNext(isDryRun, issueArg);
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
        schema: 'deterministic-gates/run/v2',
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
  const selection = deterministicGates.selectDeterministicPlanCandidate(
    issues,
    { issueIdentifier: issueArg }
  );
  if (!selection.selected) {
    return {
      team: team.key,
      status: 'blocked',
      stage: 'selection',
      reason: issueArg
        ? 'requested issue is not eligible'
        : 'no eligible issue',
      decisions: selection.decisions,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  const selected = selection.selected;
  const plan = deterministicGates.buildDeterministicPlanEvidence(selected);
  const planReason =
    plan.reason || planGate.validatePlanCandidate(selected, plan.evidence);
  if (planReason) {
    return {
      team: team.key,
      status: 'blocked',
      stage: 'plan',
      issue: selected.identifier,
      reason: planReason,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

  if (isDryRun) {
    return {
      team: team.key,
      status: 'would-admit',
      issue: selected.identifier,
      plan: plan.evidence,
      fleetGate: preflight.fleetGate,
      staleLeaseRecovery,
      mutations: 0,
    };
  }

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
    throw new Error(`admission preflight blocked: ${finalPreflight.reason}`);

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

  return {
    team: team.key,
    status: 'admitted',
    issue: selected.identifier,
    planGate: planResult.status,
    admissionGate: admissionResult.status,
    lease: lease.status,
    active: load.identifiers,
    fleetGate: finalPreflight.fleetGate,
    staleLeaseRecovery,
    mutations: 'verified',
  };
}

async function runAudit(cache, isDryRun) {
  console.log('Scanning Linear backlog...');
  const teamFetches = await Promise.allSettled(
    TEAM_CONFIGS.map(team => linear.fetchTeamActiveIssues(team.id))
  );
  const allIssues = teamFetches.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    console.error(
      `Failed to fetch ${TEAM_CONFIGS[index].key}: ${result.reason.message}`
    );
    return [];
  });
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

main().catch(err => {
  console.error(
    'Failure receipt:',
    JSON.stringify({
      schema: 'backlog-orchestrator/failure/v1',
      status: 'blocked',
      code: err.code || 'UNKNOWN',
      attempts: err.attempts,
      message: err.message,
    })
  );
  console.error('Fatal error:', err);
  process.exit(1);
});
