#!/usr/bin/env node
// Fleet audit correlator: posts GitHub-side state (workflow states, ruleset updated_at) for a repo
// to the fleet-audit Worker, which diffs it against the last snapshot and matches every change to
// the gh-shim event that caused it. Changes nobody logged alert Summer as UNATTRIBUTED.
//
// GitHub's org audit-log API is Enterprise-only (404 on our Team plan). This state diff covers the
// changes that hurt us (workflow disables, ruleset edits) with supported endpoints; the UI audit-log
// export can be added with `--github-audit-export <file.json>`.
//
//   node scripts/fleet-audit/correlate.mjs --repo JovieInc/Jovie [--dry-run]
//   node scripts/fleet-audit/correlate.mjs --github-audit-export export.json
// Env: GH_TOKEN (actions:read, administration:read optional), FLEET_AUDIT_INGEST_SECRET, FLEET_AUDIT_URL
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const flag = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const repo =
  flag('--repo') ?? process.env.GITHUB_REPOSITORY ?? 'JovieInc/Jovie';
const base = (process.env.FLEET_AUDIT_URL ?? 'https://audit.jov.ie').replace(
  /\/$/,
  ''
);
const secret = process.env.FLEET_AUDIT_INGEST_SECRET;
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
const dryRun = args.includes('--dry-run');

export async function gh(path, fetchImpl = fetch) {
  const res = await fetchImpl(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

export async function collect(repoName, fetchImpl = fetch) {
  const items = [];
  for (let page = 1; page <= 5; page++) {
    const body = await gh(
      `/repos/${repoName}/actions/workflows?per_page=100&page=${page}`,
      fetchImpl
    );
    for (const w of body.workflows ?? [])
      items.push({
        kind: 'workflow',
        id: w.id,
        name: w.name,
        path: w.path,
        state: w.state,
        updated_at: w.updated_at,
      });
    if ((body.workflows ?? []).length < 100) break;
  }
  try {
    const rulesets = await gh(
      `/repos/${repoName}/rulesets?includes_parents=true&per_page=100`,
      fetchImpl
    );
    for (const r of rulesets) {
      const full = await gh(`/repos/${repoName}/rulesets/${r.id}`, fetchImpl);
      items.push({
        kind: 'ruleset',
        id: r.id,
        name: r.name,
        updated_at: full.updated_at,
      });
    }
  } catch (err) {
    console.warn(`rulesets skipped: ${err.message}`);
  }
  return items;
}

async function post(path, payload) {
  const body = JSON.stringify(payload);
  const sig = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'x-fleet-audit-signature': sig,
    },
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`POST ${path}: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function main() {
  const exportFile = flag('--github-audit-export');
  if (!secret && !dryRun) {
    console.error('FLEET_AUDIT_INGEST_SECRET is required (or --dry-run)');
    process.exit(2);
  }
  if (exportFile) {
    const raw = readFileSync(exportFile, 'utf8').trim();
    const rows = raw.startsWith('[')
      ? JSON.parse(raw)
      : raw
          .split('\n')
          .filter(Boolean)
          .map(l => JSON.parse(l));
    console.log(
      JSON.stringify(
        dryRun ? { rows: rows.length } : await post('/v1/github-audit', rows)
      )
    );
    return;
  }
  const items = await collect(repo);
  if (dryRun) {
    console.log(
      JSON.stringify({
        repo,
        items: items.length,
        disabled: items
          .filter(i => i.state && i.state !== 'active')
          .map(i => i.name),
      })
    );
    return;
  }
  const out = await post('/v1/snapshot', {
    repo,
    items,
    github_actor: process.env.GITHUB_ACTOR ?? null,
  });
  const unattributed = out.changes.filter(c => c.status === 'unattributed');
  console.log(
    JSON.stringify({
      repo,
      items: items.length,
      changes: out.changes.length,
      unattributed: unattributed.length,
    })
  );
  for (const c of out.changes)
    console.log(`${c.status.padEnd(12)} ${c.change} ${c.target}`);
  if (process.env.GITHUB_STEP_SUMMARY && out.changes.length) {
    const { appendFileSync } = await import('node:fs');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      out.changes
        .map(c => `- ${c.status}: ${c.change} ${c.target}`)
        .join('\n') + '\n'
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(err.message);
    process.exit(1);
  });
}
