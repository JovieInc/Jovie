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
 *   node scripts/backlog-orchestrator/backlog-orchestrator.mjs report
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ----- Local imports -----
const linear = await import(resolve(__dirname, 'linear-client.mjs'));
const classifier = await import(resolve(__dirname, 'classifier.mjs'));
const scorer = await import(resolve(__dirname, 'scorer.mjs'));
const workstreamer = await import(resolve(__dirname, 'workstreamer.mjs'));
const admitter = await import(resolve(__dirname, 'admitter.mjs'));
const reporter = await import(resolve(__dirname, 'reporter.mjs'));

// ----- Config -----
const CONFIG_FILE = resolve(__dirname, 'config.json');
const CACHE_FILE = resolve(__dirname, '.orchestrator-cache.json');

const TEAM_ID = 'bdc09edc-f91c-4a06-b308-74b4fcf093f8'; // JOV team
const BACKLOG_STATE_ID = '1551ed21-7743-4573-82d8-8949410d3b8d'; // Backlog
const TODO_STATE_ID = 'c6c00506-dc9f-4910-8ff7-3874dd77174c'; // Todo
const TRIAGE_STATE_ID = '9844cfe6-6cf4-4347-842c-893a68f349b8'; // Triage

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

  if (!command || command === '--help') {
    console.log(`
Usage:
  node backlog-orchestrator.mjs reconcile           Process new/modified issues
  node backlog-orchestrator.mjs reconcile --dry-run  Dry run (no mutations)
  node backlog-orchestrator.mjs reconcile --issue=JOV-123  Single issue
  node backlog-orchestrator.mjs audit                Full backlog audit (shadow)
  node backlog-orchestrator.mjs admit-next            Admit next work item
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
  } else {
    console.error(`Unknown command: ${command}`);
    process.exit(1);
  }
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

  for (const issue of issues) {
    const stored = classifier.parseStoredClassification(issue);
    const c = classifier.classifyDeterministic(issue, issues);

    if (stored && stored.fp === c.fingerprint) {
      console.log(`  SKIP ${issue.identifier} — unchanged`);
      continue;
    }

    console.log(`  ${c.category}: ${issue.identifier} — ${(issue.title || '').slice(0, 50)}`);

    if (isDryRun) {
      console.log(`    (dry-run) would classify as ${c.category}, score ${c.valueScore}`);
      continue;
    }

    // Persist classification as machine comment
    const commentBody = classifier.buildStoredClassification(c);
    try {
      await linear.addComment(issue.id, commentBody);
    } catch (err) {
      console.error(`    Failed to add comment: ${err.message}`);
    }

    // If duplicate/obsolete, move to Backlog
    if (c.category === 'duplicate' || c.category === 'obsolete') {
      try {
        await linear.transitionIssue(issue.id, BACKLOG_STATE_ID);
        console.log(`    Moved to Backlog`);
      } catch (err) {
        console.error(`    Failed to transition: ${err.message}`);
      }
    }
  }

  console.log('Reconciliation complete.');
}

async function runAdmitNext(cache, isDryRun) {
  console.log('Checking admission eligibility...');

  const allIssues = await linear.fetchTeamActiveIssues(TEAM_ID);
  const classifications = [];
  for (const issue of allIssues) {
    const stored = classifier.parseStoredClassification(issue);
    const c = classifier.classifyDeterministic(issue, allIssues);
    if (stored) c.preexisting = stored;
    classifications.push(c);
  }

  const workstreams = workstreamer.bundleWorkstreams(classifications);

  // Check current shipping state
  const state = await scorer.currentShippingLoad();

  const result = await admitter.selectNextToAdmit(classifications, workstreams, {
    currentlyShipping: state.count,
  });

  console.log(`Admission decision: ${result.reason}`);

  if (result.admit.length > 0 && !isDryRun) {
    const item = result.admit[0];
    if (item.type === 'workstream') {
      // Move all issues in the workstream to Todo
      for (const id of item.items) {
        const issue = allIssues.find(i => i.identifier === id);
        if (issue && issue.state?.name === 'Triage') {
          try {
            await linear.transitionIssue(issue.id, TODO_STATE_ID);
            console.log(`  → Moved ${id} to Todo`);
          } catch (err) {
            console.error(`  → Failed to move ${id}: ${err.message}`);
          }
        }
      }
    } else {
      // Single issue
      const issue = allIssues.find(i => i.identifier === item.id);
      if (issue && issue.state?.name === 'Triage') {
        try {
          await linear.transitionIssue(issue.id, TODO_STATE_ID);
          console.log(`  → Moved ${item.id} to Todo`);
        } catch (err) {
          console.error(`  → Failed to move ${item.id}: ${err.message}`);
        }
      }
    }
  } else if (result.admit.length > 0) {
    console.log('  (dry-run — no mutations performed)');
  }

  // Update cache
  const newCache = { ...cache, lastAdmit: { at: new Date().toISOString(), result } };
  saveCache(newCache);

  return result;
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
