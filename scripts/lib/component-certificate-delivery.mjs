#!/usr/bin/env node
/**
 * Builds the compact Ovie delivery payload from a full component-certificate
 * report (JOV-12456). The full report with evidence receipts exceeds the
 * ~4.5MB function-body limit enforced at the edge before routing (HTTP 413),
 * so delivery posts this bounded summary instead; the full report ships as
 * the run artifact and stays the source of truth.
 *
 *   node scripts/lib/component-certificate-delivery.mjs <report.json> --out <payload.json>
 *
 * The builder fails closed if the compact payload would outgrow the ingest
 * route's own bounded body cap — payload growth must be a loud delivery
 * failure, never a silent truncated post.
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const DELIVERY_SCHEMA = 'jovie.component-certificate-evidence/v1';
export const MAX_FAILING_COMPONENTS = 25;
export const MAX_DELIVERY_BYTES = 60 * 1024;

function countFailing(report) {
  return (report.certificates ?? []).filter(c => c?.certified === false).length;
}

export function buildDeliveryPayload(report, meta = {}) {
  if (!report?.totals?.byCriterion)
    throw new Error('report has no totals.byCriterion');
  // The ingest route only accepts a 40-hex headSha; a report without one
  // must fail closed here with a clear error, not 400 at the route.
  if (!/^[0-9a-f]{40}$/u.test(report.headSha ?? ''))
    throw new Error('report has no valid 40-hex headSha');
  const totals = report.totals;
  const failing = (report.certificates ?? [])
    .filter(c => c?.certified === false && typeof c?.component === 'string')
    .slice(0, MAX_FAILING_COMPONENTS)
    .map(c => ({
      component: c.component.slice(0, 300),
      passing: typeof c.passing === 'number' ? c.passing : 0,
      applicable: typeof c.applicable === 'number' ? c.applicable : 0,
    }));
  const runUrl = meta.runUrl ?? null;
  return {
    schema: DELIVERY_SCHEMA,
    headSha: report.headSha,
    evaluatedAt: meta.evaluatedAt ?? report.generatedAt ?? null,
    reportBytes: meta.reportBytes ?? null,
    totals: {
      components:
        typeof totals.components === 'number' ? totals.components : null,
      certified: typeof totals.certified === 'number' ? totals.certified : null,
      byCriterion: totals.byCriterion,
    },
    failingComponentsTotal: countFailing(report),
    failingComponents: failing,
    runUrl,
    artifactName: meta.artifactName ?? null,
  };
}

export function serializeDeliveryPayload(payload) {
  const json = JSON.stringify(payload);
  if (Buffer.byteLength(json, 'utf8') > MAX_DELIVERY_BYTES)
    throw new Error(
      `compact delivery payload exceeds ${MAX_DELIVERY_BYTES} bytes; tighten the payload, do not post the full report`
    );
  return `${json}\n`;
}

function main() {
  const { positionals, values } = parseArgs({
    options: {
      out: { type: 'string' },
      'artifact-name': { type: 'string' },
    },
    allowPositionals: true,
  });
  const reportPath = positionals[0];
  if (!reportPath || !values.out) {
    console.error(
      'Usage: node scripts/lib/component-certificate-delivery.mjs <report.json> --out <payload.json>'
    );
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const serverUrl = process.env.GITHUB_SERVER_URL;
  const runId = process.env.GITHUB_RUN_ID;
  const repository = process.env.GITHUB_REPOSITORY;
  const runUrl =
    serverUrl && repository && runId
      ? `${serverUrl}/${repository}/actions/runs/${runId}`
      : null;
  const payload = buildDeliveryPayload(report, {
    reportBytes: statSync(reportPath).size,
    runUrl,
    artifactName:
      values['artifact-name'] ??
      (runId ? `component-certificate-${runId}` : null),
  });
  writeFileSync(values.out, serializeDeliveryPayload(payload));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
