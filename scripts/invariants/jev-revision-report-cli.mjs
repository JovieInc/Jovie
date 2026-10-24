import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildRevisionQualityReport } from './jev-revision-report.mjs';

export function renderRevisionReport(report) {
  const lines = [
    '# Held-out revision quality (JOV-8414)',
    '',
    `Status: **${report.status}**. Quality gain: ${report.qualityGain ?? 'unknown'}.`,
    `Corpus: ${report.corpusVersion ?? 'absent'}; held-out: ${report.heldoutCount}; matched runs: ${report.matchedRuns}.`,
    `Comparison passed: ${report.comparisonPassed}; critical fixtures passed: ${report.criticalFixturesPassed}; protected metrics passed: ${report.protectedMetricsPassed}.`,
    '',
    '| Candidate / pipeline metric | Baseline | Revised |',
    '| --- | --- | --- |',
  ];
  for (const key of [
    'usefulness',
    'voice',
    'factualFalseAcceptance',
    'abstention',
    'fallback',
    'latencyMs',
    'attributableCostUsd',
    'tokens',
  ])
    lines.push(
      `| ${key} | ${JSON.stringify(report.metrics.baseline[key])} | ${JSON.stringify(report.metrics.revised[key])} |`
    );
  for (const key of [
    'pairedDelta',
    'introducedDrift',
    'preservationFailures',
    'revisionCounts',
    'failures',
  ])
    lines.push('', `${key}: ${JSON.stringify(report.metrics[key])}`);
  lines.push(
    '',
    `Scenario counts: ${JSON.stringify(report.scenarios)}`,
    '',
    'Evidence hashes:',
    '',
    '```json',
    JSON.stringify(report.hashes, null, 2),
    '```'
  );
  if (report.reasons.length)
    lines.push(
      '',
      'Inconclusive evidence:',
      '',
      ...report.reasons.map(r => `- ${r}`)
    );
  lines.push(
    '',
    report.authority,
    '',
    'Scores describe human-labeled candidates; paired deltas exclude absent outputs. Revised latency/cost include the baseline plus revision and recheck. Unknown costs are null. No provider calls were made by this report.',
    'Zero observed errors do not establish rare-event safety. Synthetic contract fixtures are not human quality evidence.',
    ''
  );
  return lines.join('\n');
}

/** Replaying the same frozen JSON produces identical output; no clock or provider dependency. */
export function main(argv = process.argv.slice(2)) {
  const arg = flag => argv[argv.indexOf(flag) + 1];
  let report;
  try {
    if (!argv.includes('--input') || !arg('--input'))
      throw new Error('missing --input');
    if (statSync(arg('--input')).size > 16 * 1024 * 1024)
      throw new Error('input exceeds 16 MiB');
    report = buildRevisionQualityReport(
      JSON.parse(readFileSync(arg('--input'), 'utf8'))
    );
  } catch {
    report = buildRevisionQualityReport();
    report.reasons.unshift('input-missing-unreadable-invalid-or-over-16-MiB');
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (argv.includes('--json')) writeFileSync(arg('--json'), json);
  else process.stdout.write(json);
  if (argv.includes('--markdown'))
    writeFileSync(arg('--markdown'), renderRevisionReport(report));
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = main();
  process.exitCode = report.status === 'inconclusive' ? 2 : 0;
}
