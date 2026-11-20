#!/usr/bin/env node
// Fire repository_dispatch dependabot_alert so security-advisory-loop.yml runs
// the same intake as the Gem 4h clock. Producers: a GitHub App/org webhook that
// receives dependabot_alert, or an operator with a token that can create
// repository dispatches.
//
//   node scripts/security/advisory-event-wake.mjs [--dry-run] <<JSON
//   {"action":"created","alert":{...}}
//
// Env: GH_TOKEN or GH_DISPATCH_TOKEN, GITHUB_REPOSITORY (default JovieInc/Jovie).

import { readFileSync } from 'node:fs';
import {
  dependabotAlertDispatchBody,
  planDependabotAlertWake,
} from '../lib/security-advisory-event-wake.mjs';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const raw = readFileSync(0, 'utf8').trim();
  if (!raw)
    throw new Error('stdin must be a Dependabot alert webhook JSON body');
  const event = JSON.parse(raw);
  const plan = planDependabotAlertWake(event);
  if (!plan.wake) {
    console.log(
      JSON.stringify({ ok: true, skipped: true, reason: plan.reason })
    );
    return;
  }
  const body = dependabotAlertDispatchBody(plan.clientPayload);
  if (dryRun) {
    console.log(JSON.stringify({ ok: true, dryRun: true, body }));
    return;
  }
  const token = process.env.GH_DISPATCH_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('GH_DISPATCH_TOKEN or GH_TOKEN is required');
  const repo = process.env.GITHUB_REPOSITORY || 'JovieInc/Jovie';
  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(
      new Error(
        `repository_dispatch failed (${res.status}): ${text.slice(0, 200)}`
      ),
      { exitCode: 1 }
    );
  }
  console.log(
    JSON.stringify({
      ok: true,
      dispatched: body.event_type,
      alert_number: plan.clientPayload.alert_number,
      ghsa_id: plan.clientPayload.ghsa_id,
    })
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = error?.exitCode ?? 1;
}
