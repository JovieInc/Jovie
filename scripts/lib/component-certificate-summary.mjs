#!/usr/bin/env node
/** Usage: node scripts/lib/component-certificate-summary.mjs report.json */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
export function renderCertificateSummary(report) {
  const t = report?.totals;
  if (!t?.byCriterion) throw new Error('report has no totals.byCriterion');
  const lines = [
    '### Component certificate',
    '',
    `Commit \`${String(report.headSha ?? 'unknown').slice(0, 12)}\`: ${t.certified} of ${t.components} components certified (informational).`,
    '',
    '| Criterion | Pass | Fail | Unknown | N/A |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [id, v] of Object.entries(t.byCriterion))
    lines.push(`| ${id} | ${v.pass} | ${v.fail} | ${v.unknown} | ${v.na} |`);
  return `${lines.join('\n')}\n`;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.stdout.write(
    renderCertificateSummary(JSON.parse(readFileSync(process.argv[2], 'utf8')))
  );
}
