#!/usr/bin/env node
// Summer security CSO bus consumer (SEC-13). Plans investigate packets for
// Linear security work and high SARIF alerts; refuses close without a fix PR.
//
//   node scripts/security/cso-bus-consumer.mjs --dry-run <<JSON
//   {"linearIssues":[...],"sarifAlerts":[...],"closingIdentifiers":["JOV-1"]}
//
// api-budget: linear-requests 30/hr - Summer catch-up / workflow_dispatch: one
// batched Linear read + at most one comment write per open security issue

import { readFileSync } from 'node:fs';
import {
  planCsoBusActions,
  requireFixPrBeforeClose,
} from '../lib/security-cso-bus.mjs';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const raw = readFileSync(0, 'utf8').trim();
  if (!raw) throw new Error('stdin must be JSON with linearIssues/sarifAlerts');
  const input = JSON.parse(raw);
  const plan = planCsoBusActions(input);
  for (const id of input.closingIdentifiers ?? []) {
    const issue = (input.linearIssues ?? []).find(
      row => row.identifier === id || row.id === id
    );
    const gate = requireFixPrBeforeClose(issue?.description);
    if (!gate.ok) {
      plan.blockClose.push({
        action: 'block-close',
        identifier: id,
        reason: gate.reason,
      });
    }
  }
  // Deduplicate blockClose by identifier
  const seen = new Set();
  plan.blockClose = plan.blockClose.filter(row => {
    if (seen.has(row.identifier)) return false;
    seen.add(row.identifier);
    return true;
  });
  if (dryRun || process.env.CSO_BUS_APPLY !== '1') {
    console.log(JSON.stringify({ ok: true, dryRun: true, plan }, null, 2));
    if (plan.blockClose.length) process.exitCode = 2;
    return;
  }
  // Apply path is Summer catch-up owned (Linear comments); this CLI stays
  // plan-only unless CSO_BUS_APPLY=1 and a later Summer adapter writes.
  console.log(
    JSON.stringify({
      ok: true,
      applied: false,
      reason: 'apply-adapter-not-wired-in-jovie; plan only',
      plan,
    })
  );
  if (plan.blockClose.length) process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
