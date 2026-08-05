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

// Keep the complete control-plane dependency closure visible to source sync and
// module tooling. These are canonical sibling modules, not host-only copies.
import * as admitter from './admitter.mjs';
import * as admissionGate from './admission-gate.mjs';
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

const TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8'; // JOV team
const BACKLOG_STATE_ID = '1551ed21-7743-4573-82d8-8949410d3b8d'; // Backlog
const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c'; // Todo

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
    teamId: TEAM_ID,
  });
  console.log(JSON.stringify(receipt, null, 2));
}

async function admissionPreflight() {
  const productionRed = await scorer.isProductionRed();
  if (productionRed) {
    return {
      open: false,
      reason: 'production health is red or unavailable',
      load: { count: 0, identifiers: [] },
    };
  }
  const symphonyIssues = await linear.fetchTeamSymphonyIssues(TEAM_ID);
  const load = deterministicGates.admissionIntentLoad(symphonyIssues);
  return {
    open: load.count < admitter.MAX_CONCURRENT_SHIPPING,
    reason:
      load.count < admitter.MAX_CONCURRENT_SHIPPING
        ? 'open'
        : `at capacity (${load.count}/${admitter.MAX_CONCURRENT_SHIPPING})`,
    load,
  };
}

async function runGateNext(isDryRun, issueArg) {
  const preflight = await admissionPreflight();
  if (!preflight.open) {
    console.log(
      JSON.stringify(
        {
          schema: 'deterministic-gates/run/v1',
          status: 'blocked',
          stage: 'preflight',
          reason: preflight.reason,
          active: preflight.load.identifiers,
          mutations: 0,
        },
        null,
        2
      )
    );
    return;
  }

  const issues = issueArg
    ? [await linear.fetchIssue(issueArg)].filter(Boolean)
    : await linear.fetchTeamGateCandidates(TEAM_ID);
  const selection = deterministicGates.selectDeterministicPlanCandidate(
    issues,
    { issueIdentifier: issueArg }
  );
  if (!selection.selected) {
    console.log(
      JSON.stringify(
        {
          schema: 'deterministic-gates/run/v1',
          status: 'blocked',
          stage: 'selection',
          reason: issueArg ? 'requested issue is not eligible' : 'no eligible issue',
          decisions: selection.decisions,
          mutations: 0,
        },
        null,
        2
      )
    );
    return;
  }

  const selected = selection.selected;
  const plan = deterministicGates.buildDeterministicPlanEvidence(selected);
  const planReason =
    plan.reason || planGate.validatePlanCandidate(selected, plan.evidence);
  if (planReason) {
    console.log(
      JSON.stringify(
        {
          schema: 'deterministic-gates/run/v1',
          status: 'blocked',
          stage: 'plan',
          issue: selected.identifier,
          reason: planReason,
          mutations: 0,
        },
        null,
        2
      )
    );
    return;
  }

  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          schema: 'deterministic-gates/run/v1',
          status: 'would-admit',
          issue: selected.identifier,
          plan: plan.evidence,
          mutations: 0,
        },
        null,
        2
      )
    );
    return;
  }

  const planResult = await planGate.approvePlan({
    issue: selected,
    evidence: plan.evidence,
    client: linear,
    teamId: TEAM_ID,
  });
  if (planResult.status === 'rejected')
    throw new Error(`plan gate rejected: ${planResult.reason}`);

  let current = await linear.fetchIssue(selected.identifier);
  const finalPreflight = await admissionPreflight();
  if (!finalPreflight.open)
    throw new Error(`admission preflight blocked: ${finalPreflight.reason}`);

  const admissionResult = await admissionGate.approveAdmission({
    issue: current,
    client: linear,
    teamId: TEAM_ID,
  });
  if (admissionResult.status === 'rejected')
    throw new Error(`admission gate rejected: ${admissionResult.reason}`);

  current = await linear.fetchIssue(selected.identifier);
  const classification = classifier.classifyDeterministic(current, [current]);
  classification.issue = current;
  classification.labels = current.labels.nodes.map(label => label.name);
  const lease = await admitter.admitIssue({
    issue: current,
    classification,
    client: linear,
    teamId: TEAM_ID,
    todoStateId: TODO_STATE_ID,
  });
  if (!['admitted', 'already-admitted'].includes(lease.status))
    throw new Error(`lease rejected: ${lease.reason}`);

  const verified = await linear.fetchIssue(selected.identifier);
  const evidence = admitter.hasAdmissionEvidence(verified);
  const load = deterministicGates.admissionIntentLoad([verified]);
  if (
    verified.state?.name !== 'Todo' ||
    !evidence.eligible ||
    !verified.labels.nodes.some(label => label.name === admitter.SYMPHONY_LABEL) ||
    load.count !== 1
  )
    throw new Error('final gate-and-lease verification failed');

  console.log(
    JSON.stringify(
      {
        schema: 'deterministic-gates/run/v1',
        status: 'admitted',
        issue: selected.identifier,
        planGate: planResult.status,
        admissionGate: admissionResult.status,
        lease: lease.status,
        active: load.identifiers,
        mutations: 'verified',
      },
      null,
      2
    )
  );
}

async function runAudit(cache, isDryRun) {
  console.log('Scanning Linear backlog...');
  const allIssues = await linear.fetchTeamActiveIssues(TEAM_ID);
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
  let issues;
  if (issueArg) {
    const issue = await linear.fetchIssue(issueArg);
    issues = issue ? [issue] : [];
    if (!issue) {
      console.log(`Issue ${issueArg} not found`);
      return;
    }
  } else {
    console.log('Fetching Triage issues...');
    issues = await linear.fetchTeamTriageIssues(TEAM_ID);
  }

  console.log(`Processing ${issues.length} issues`);

  const receipt = await reconciler.reconcileIssues({
    issues,
    client: linear,
    isDryRun,
    backlogStateId: BACKLOG_STATE_ID,
  });

  console.log('Reconciliation receipt:');
  console.log(JSON.stringify(receipt, null, 2));
  console.log('Reconciliation complete.');
}

async function runAdmitNext(cache, isDryRun) {
  console.log('Checking admission eligibility...');

  // Release only provably stale machine leases before ordinary admission. This
  // is intentionally scoped to unassigned In Progress issues; it never touches
  // Tim-assigned or otherwise ambiguous work.
  const inProgressIssues = await linear.fetchTeamInProgressIssues(TEAM_ID);
  if (isDryRun) {
    const planned = inProgressIssues
      .map(issue => ({
        identifier: issue.identifier,
        decision: staleLeaseGuard.classifyStaleLease(issue),
      }))
      .filter(entry => entry.decision.eligible);
    console.log(`Stale-lease sweep (dry-run): ${planned.length} eligible`);
  } else {
    const staleLeaseResult = await staleLeaseGuard.sweepStaleLeases({
      issues: inProgressIssues,
      client: linear,
    });
    console.log(
      `Stale-lease sweep: recovered ${staleLeaseResult.recovered.length}, ` +
        `skipped ${staleLeaseResult.skipped.length}, failed ${staleLeaseResult.failed.length}`
    );
  }

  const allIssues = await linear.fetchTeamActiveIssues(TEAM_ID);
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

  const result = await admitter.selectNextToAdmit(
    classifications,
    workstreams,
    {
      currentlyShipping: state.count,
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
        teamId: TEAM_ID,
        todoStateId: TODO_STATE_ID,
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

  // Update cache
  const newCache = {
    ...cache,
    lastAdmit: { at: new Date().toISOString(), result },
  };
  saveCache(newCache);

  return result;
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
