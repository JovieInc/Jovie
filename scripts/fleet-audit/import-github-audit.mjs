#!/usr/bin/env node
// Import a GitHub org audit-log export into the fleet audit trail.
//
// The audit-log REST/GraphQL API is Enterprise-only (404 on our Team plan); the supported route is
// the UI export (Org settings > Audit log > Export, JSON or NDJSON). The fleet-audit Worker matches
// each workflow / ruleset / protection / secret row to the gh-shim event that explains it, so
// "itstimwhite did X" maps to an agent, and stores unmatched rows as unattributed.
// Hourly workflow-state and ruleset correlation runs in the Worker cron itself.
//
//   node scripts/fleet-audit/import-github-audit.mjs export.json [--dry-run]
// Env: FLEET_AUDIT_INGEST_SECRET (or ~/.config/jovie/fleet-audit.secret), FLEET_AUDIT_URL
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function parseExport(raw) {
  const text = raw.trim();
  if (!text) return [];
  return text.startsWith('[')
    ? JSON.parse(text)
    : text
        .split('\n')
        .filter(Boolean)
        .map(l => JSON.parse(l));
}

export function sign(body, secret) {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

function secret() {
  if (process.env.FLEET_AUDIT_INGEST_SECRET)
    return process.env.FLEET_AUDIT_INGEST_SECRET;
  try {
    return readFileSync(
      join(homedir(), '.config/jovie/fleet-audit.secret'),
      'utf8'
    ).trim();
  } catch {
    return '';
  }
}

async function main(argv) {
  const file = argv.find(a => !a.startsWith('--'));
  if (!file) {
    console.error(
      'usage: import-github-audit.mjs <export.json|ndjson> [--dry-run]'
    );
    return 2;
  }
  const rows = parseExport(readFileSync(file, 'utf8'));
  if (argv.includes('--dry-run')) {
    console.log(JSON.stringify({ rows: rows.length }));
    return 0;
  }
  const key = secret();
  if (!key) {
    console.error(
      'FLEET_AUDIT_INGEST_SECRET (or ~/.config/jovie/fleet-audit.secret) is required'
    );
    return 2;
  }
  const base = (
    process.env.FLEET_AUDIT_URL ??
    'https://jovie-fleet-audit.tim-fd8.workers.dev'
  ).replace(/\/$/, '');
  let attributed = 0;
  let unattributed = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const body = JSON.stringify(rows.slice(i, i + 2000));
    const res = await fetch(`${base}/v1/github-audit`, {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        'x-fleet-audit-signature': sign(body, key),
      },
    });
    if (!res.ok) {
      console.error(`import failed: ${res.status}`);
      return 1;
    }
    const out = await res.json();
    attributed += out.attributed;
    unattributed += out.unattributed;
  }
  console.log(JSON.stringify({ rows: rows.length, attributed, unattributed }));
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(code => process.exit(code));
}
