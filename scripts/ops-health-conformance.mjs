#!/usr/bin/env node
// Usage: node scripts/ops-health-conformance.mjs [--service <id|prefix>] [--expect-sha <sha>] [--json]
// "Is X live?": --service jovie-web:production --expect-sha <sha> exits 1 unless that exact commit is serving.
import { ghCompare, runConformance } from './lib/ops-health-conformance.mjs';

const arg = name =>
  process.argv.includes(name)
    ? process.argv[process.argv.indexOf(name) + 1]
    : null;

const report = await runConformance({
  only: arg('--service'),
  expectSha: arg('--expect-sha'),
  compare: ghCompare,
});
if (process.argv.includes('--json'))
  console.log(JSON.stringify(report, null, 2));
else {
  for (const r of report.results) {
    const lag = r.lag
      ? ` lag=${r.lag.state}${r.lag.behindBy ? `(${r.lag.behindBy})` : ''}`
      : '';
    console.log(
      `${r.verdict.padEnd(16)} ${r.id.padEnd(24)} sha=${r.commitSha?.slice(0, 12) ?? 'unknown'} status=${r.status ?? 'n/a'}${lag}${r.errors.length ? `\n    ${r.errors.join('\n    ')}` : ''}`
    );
  }
}
process.exit(report.ok ? 0 : 1);
