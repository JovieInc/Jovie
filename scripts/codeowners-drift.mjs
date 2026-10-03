#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { unmatchedCodeownersPatterns } from './lib/codeowners-drift.mjs';
import { upsertLinearIssueByTitleFingerprint } from './lib/linear-issue-intake.mjs';

const FINGERPRINT = 'remediation:codeowners-drift';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

async function main() {
  const reportPath = argument('--report') || argument('--out');
  const file = process.argv.includes('--file-linear');
  let unmatched;
  if (file && reportPath) {
    unmatched = JSON.parse(readFileSync(reportPath, 'utf8')).unmatched;
  } else {
    unmatched = unmatchedCodeownersPatterns(
      readFileSync('.github/CODEOWNERS', 'utf8'),
      trackedFiles()
    );
    if (reportPath)
      writeFileSync(reportPath, `${JSON.stringify({ unmatched }, null, 2)}\n`);
  }
  if (!Array.isArray(unmatched))
    throw new Error('CODEOWNERS drift report is missing unmatched patterns');
  if (unmatched.length === 0) {
    console.log('CODEOWNERS patterns all match a tracked file');
    return;
  }
  console.error(
    `CODEOWNERS drift: ${unmatched.length} pattern(s) match no tracked file`
  );
  for (const entry of unmatched) {
    console.error(`L${entry.line}: ${entry.pattern} (${entry.reason})`);
  }
  if (!file) {
    process.exitCode = 1;
    return;
  }
  const listed = unmatched
    .slice(0, 50)
    .map(entry => `L${entry.line} \`${entry.pattern}\` (${entry.reason})`)
    .join('\n');
  const result = await upsertLinearIssueByTitleFingerprint({
    fingerprint: FINGERPRINT,
    title: `CODEOWNERS patterns match no tracked file (${FINGERPRINT})`,
    description: [
      'File .github/CODEOWNERS. Workflow codeowners-drift.yml. Current issue JOV-7549.',
      'At least one CODEOWNERS pattern matches no tracked file.',
      listed,
      unmatched.length > 50 ? `${unmatched.length - 50} more` : null,
      'Reopens while any pattern is unmatched. CODEOWNERS itself is not edited by this check.',
      `Fingerprint: \`${FINGERPRINT}\``,
    ]
      .filter(Boolean)
      .join('\n'),
    priority: 3,
    createStateName: 'Todo',
    reopenTerminal: true,
  });
  if (!result.ok) throw new Error(`Linear intake failed: ${result.reason}`);
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
