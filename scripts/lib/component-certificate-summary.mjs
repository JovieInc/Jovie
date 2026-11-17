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
    `Commit \`${String(report.headSha ?? 'unknown').slice(0, 12)}\`: ${t.certified} of ${t.components} components certified (${t.components > 0 ? ((100 * t.certified) / t.components).toFixed(1) : 'N/A'}%; informational).`,
    'Report generation: complete. Delivery and persisted ingestion are separate; consult the delivery receipt and persisted readback.',
    `Evidence health: ${Object.values(t.byCriterion).reduce((sum, v) => sum + v.unknown, 0)} unknown criterion results. Unknown and N/A are not runtime proof.`,
    '',
    '| Criterion | Pass | Fail | Unknown | N/A |',
    '| --- | ---: | ---: | ---: | ---: |',
  ];
  for (const [id, v] of Object.entries(t.byCriterion))
    lines.push(`| ${id} | ${v.pass} | ${v.fail} | ${v.unknown} | ${v.na} |`);
  lines.push(
    '',
    'Proof limits: test/assertion, unit-axe and input-retention source checks are structural evidence, not executed receipts. Storybook axe receipts provide runtime evidence only for their recorded stories. Screenshot hashes prove capture, not visual regression approval. Journey N/A does not prove journey coverage.',
    'Receipt scope: component source/test binding does not yet include shared UI/global CSS dependencies or validate the expected story manifest. Certification totals reflect the current evaluator; they do not establish complete runtime or visual approval.'
  );
  return `${lines.join('\n')}\n`;
}
export function renderA11ySummary(outcome, receipt, shard) {
  const total = receipt?.numTotalTests;
  const suites = receipt?.numTotalTestSuites;
  const files = receipt?.testResults;
  const assertions = Array.isArray(files)
    ? files.flatMap(file => file?.assertionResults ?? [])
    : [];
  const complete =
    receipt?.success === true &&
    Number.isInteger(total) &&
    total > 0 &&
    receipt.numPassedTests === total &&
    receipt.numFailedTests === 0 &&
    receipt.numPendingTests === 0 &&
    receipt.numTodoTests === 0 &&
    Number.isInteger(suites) &&
    suites > 0 &&
    receipt.numPassedTestSuites === suites &&
    receipt.numFailedTestSuites === 0 &&
    receipt.numPendingTestSuites === 0 &&
    Array.isArray(files) &&
    files.length > 0 &&
    files.every(
      file => file?.status === 'passed' && Array.isArray(file.assertionResults)
    ) &&
    assertions.length === total &&
    assertions.every(test => test?.status === 'passed');
  const status =
    outcome === 'success'
      ? complete
        ? `PASS: ${total} tests passed in this shard.`
        : 'UNKNOWN: command succeeded without complete passing test evidence.'
      : outcome === 'failure'
        ? 'FAIL: test command failed; inspect the shard log for test or harness errors.'
        : outcome === 'skipped'
          ? 'SKIPPED: tests did not execute.'
          : outcome === 'cancelled'
            ? 'CANCELLED: test execution did not complete.'
            : 'UNKNOWN: test outcome is missing or unrecognized.';
  return `## A11y Check Results — shard ${shard}/16\n\n${status}\n\nPost-main/manual evidence lane; not a required PR check.\n`;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === '--a11y') {
    let receipt;
    try {
      receipt = JSON.parse(readFileSync(process.argv[4], 'utf8'));
    } catch {
      /* Missing or invalid receipts remain unknown. */
    }
    process.stdout.write(
      renderA11ySummary(process.argv[3], receipt, process.argv[5])
    );
  } else {
    process.stdout.write(
      renderCertificateSummary(
        JSON.parse(readFileSync(process.argv[2], 'utf8'))
      )
    );
  }
}
