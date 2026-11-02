#!/usr/bin/env node
// Files one bounded "strengthen test" Linear issue per module that has real
// survivors, from the task JSON the sweep wrote. Kept separate from the sweep
// so the only step that sees LINEAR_API_KEY never runs Stryker or repo tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { buildSurvivorIssue } from './lib/mutation-sweep.mjs';

const { values } = parseArgs({
  options: {
    tasks: { type: 'string' },
    'run-url': { type: 'string' },
  },
});
if (!values.tasks) throw new Error('--tasks <dir> is required');

let names = [];
try {
  names = readdirSync(values.tasks).filter(name => name.endsWith('.json'));
} catch {
  console.log(`No survivor tasks at ${values.tasks}.`);
}
let filed = 0;
for (const name of names.sort()) {
  const task = JSON.parse(readFileSync(join(values.tasks, name), 'utf8'));
  if (!Array.isArray(task.survivors) || task.survivors.length === 0) continue;
  const issue = buildSurvivorIssue(task.file, task.survivors, {
    score: task.score,
    valid: task.valid,
    tests: task.tests ?? [],
    sha: task.sha,
    runUrl: values['run-url'] ?? null,
  });
  if (!remediationTriggersEnabled(process.env) || !process.env.LINEAR_API_KEY) {
    logRemediationDryRun({
      action: 'upsert',
      key: 'mutation-survivors',
      fingerprint: issue.fingerprint,
    });
    continue;
  }
  const res = await upsertLinearIssueByTitleFingerprint({
    fingerprint: issue.fingerprint,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    reopenTerminal: false,
    labelKey: issue.labelKey,
  });
  console.log(
    `Linear survivors issue (${task.file}): ${res.action ?? 'failed'} ${res.url ?? res.reason ?? ''}`
  );
  filed += 1;
}
console.log(
  `${filed} survivor issue(s) filed from ${names.length} task file(s).`
);
