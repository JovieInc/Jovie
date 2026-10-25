#!/usr/bin/env node
/**
 * Posts a component-certificate report (plus the defect->guard weekly summary)
 * to Ovie: POST /api/internal/ovie/component-certificate-evidence.
 *
 *   node scripts/component-certificate.mjs --all --out report.json
 *   CRON_SECRET=... node scripts/post-component-certificates.mjs report.json \
 *     [--url https://jov.ie] [--dry-run]
 *
 * The full report is ~3 MB; only what Ovie renders is sent (criterion status,
 * journeys, missing criterion + reason; the fix recipe stays in --spec), so the body stays far below the request cap.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { summarizeGuards } from './lib/component-certificate.mjs';

export function slimReport(report) {
  return {
    schema: report.schema,
    generatedAt: report.generatedAt,
    headSha: report.headSha,
    totals: report.totals,
    certificates: report.certificates.map(c => ({
      component: c.component,
      certified: c.certified,
      criteria: c.criteria.map(k => ({
        id: k.id,
        status: k.status,
        ...(k.id === 'journeys' && Array.isArray(k.journeys)
          ? { journeys: k.journeys }
          : {}),
      })),
      missing: c.missing.map(m => ({
        criterion: m.criterion,
        reason: m.reason,
      })),
    })),
  };
}

export function buildPayload(report, registry) {
  const { errors: _errors, ...guards } = summarizeGuards(registry);
  return { report: slimReport(report), guards };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string', default: 'https://jov.ie' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const report = JSON.parse(readFileSync(positionals[0], 'utf8'));
  const registry = JSON.parse(
    readFileSync(
      join(root, 'docs/design-system/defect-guard-registry.json'),
      'utf8'
    )
  );
  const body = JSON.stringify(buildPayload(report, registry));
  if (values['dry-run']) {
    console.log(`would post ${Buffer.byteLength(body)} bytes`);
    process.exit(0);
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET is required');
    process.exit(2);
  }
  const res = await fetch(
    `${values.url}/api/internal/ovie/component-certificate-evidence`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body,
    }
  );
  console.log(res.status, await res.text());
  process.exit(res.ok ? 0 : 1);
}
