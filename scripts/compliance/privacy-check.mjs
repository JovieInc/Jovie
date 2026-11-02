#!/usr/bin/env node
// Privacy check runner (compliance loop, stages 2 and 4).
//
// Runs the negative controls, evaluates a privacy-inventory snapshot against
// the rules and writes one evidence record: snapshot + results + controls +
// registry and policy versions + code revision. The record is the defence
// file; publish it with `gbrain capture --file <record> --slug
// compliance/privacy-evidence/<run-id>` (see canon/COMPLIANCE.md TRK-1).
//
// Usage: node scripts/compliance/privacy-check.mjs --snapshot snap.json
//        [--record out.json] [--markdown out.md]
// Exit 0 = no fails, 1 = rule fails, 2 = a negative control did not bite.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { REGISTRY_PATH } from './privacy-inventory.mjs';
import { evaluate, RULES, runControls, summarize } from './privacy-rules.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function revision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

export function buildRecord(snapshot, registry) {
  const controls = runControls();
  const results = evaluate(snapshot, registry);
  return {
    schema: 'jovie.privacy-evidence/v1',
    run_id: snapshot.run_id,
    recorded_at: new Date().toISOString(),
    code_revision: revision(),
    registry_sha256: snapshot.registry_sha256,
    policy_versions: Object.fromEntries(
      Object.entries(snapshot.policy_versions ?? {}).map(([k, v]) => [
        k,
        { url: v.url, sha256: v.sha256 ?? null, error: v.error ?? null },
      ])
    ),
    controls,
    controls_ok: controls.every(c => c.ok),
    summary: summarize(results),
    results,
    snapshot,
  };
}

export function toMarkdown(record) {
  const lines = [
    `# Privacy compliance snapshot ${record.recorded_at.slice(0, 16)}Z`,
    '',
    `Run ${record.run_id}; code ${record.code_revision ?? 'unknown'}; registry ${record.registry_sha256?.slice(0, 12)}.`,
    `Negative controls: ${record.controls_ok ? 'all bit' : 'FAILED'}. Result: ${record.summary.fail} fail, ${record.summary.warn} warn, ${record.summary.pass} pass.`,
    '',
    '| Rule | Fail | Warn | Pass |',
    '|---|---|---|---|',
  ];
  for (const id of Object.keys(RULES)) {
    const r = record.summary.by_rule[id] ?? { fail: 0, warn: 0, pass: 0 };
    lines.push(`| ${id} | ${r.fail} | ${r.warn} | ${r.pass} |`);
  }
  lines.push('', '## Fails and warnings', '');
  for (const r of record.results.filter(x => x.status !== 'pass')) {
    lines.push(
      `- **${r.status}** ${r.rule} · ${r.surface}${r.scenario ? ` (${r.scenario})` : ''}: ${r.detail}`
    );
  }
  lines.push('', '## Policy versions', '');
  for (const [id, p] of Object.entries(record.policy_versions)) {
    lines.push(`- ${id}: ${p.url} sha256 ${p.sha256 ?? p.error}`);
  }
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const snapshotPath = arg('--snapshot');
  if (!snapshotPath) {
    process.stderr.write(
      'usage: privacy-check.mjs --snapshot snap.json [--record out.json] [--markdown out.md]\n'
    );
    process.exit(64);
  }
  const registry = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  const record = buildRecord(snapshot, registry);
  if (arg('--record'))
    writeFileSync(arg('--record'), `${JSON.stringify(record, null, 2)}\n`);
  const md = toMarkdown(record);
  if (arg('--markdown')) writeFileSync(arg('--markdown'), md);
  process.stdout.write(md);
  process.exit(!record.controls_ok ? 2 : record.summary.fail ? 1 : 0);
}
