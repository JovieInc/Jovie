#!/usr/bin/env node
// File one bounded "strengthen test" Linear issue per module from the sweep's
// survivor tasks. Runs on the host that holds Linear credentials (never inside
// the sweep job, which has no secrets):
//
//   node scripts/mutation-file-survivors.mjs --tasks ~/.local/state/jovie-mutation/survivor-tasks
//
// Issues dedupe by fingerprint (`mutation-survivors:<file>`), so a re-run
// updates the same issue. A filed task file moves to <tasks>/filed/.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
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
    cap: { type: 'string', default: '10' },
    'dry-run': { type: 'boolean', default: false },
  },
});
if (!values.tasks) throw new Error('--tasks <dir> is required');
const dir = resolve(values.tasks);
if (!existsSync(dir)) process.exit(0);
const cap = Number(values.cap);
mkdirSync(join(dir, 'filed'), { recursive: true });

let filed = 0;
for (const name of readdirSync(dir)
  .filter(n => n.endsWith('.json'))
  .sort()) {
  if (filed >= cap) {
    console.log(`Cap ${cap} reached; rest next run.`);
    break;
  }
  const task = JSON.parse(readFileSync(join(dir, name), 'utf8'));
  if (!Array.isArray(task.survivors) || task.survivors.length === 0) {
    renameSync(join(dir, name), join(dir, 'filed', name));
    continue;
  }
  const issue = buildSurvivorIssue(task.file, task.survivors, {
    score: task.score,
    valid: task.valid,
    tests: task.tests ?? [],
    sha: task.sha,
  });
  if (values['dry-run'] || !remediationTriggersEnabled(process.env)) {
    logRemediationDryRun({
      action: 'upsert',
      key: 'mutation-survivors',
      fingerprint: issue.fingerprint,
    });
    console.log(issue.title);
    continue;
  }
  const result = await upsertLinearIssueByTitleFingerprint({
    fingerprint: issue.fingerprint,
    title: issue.title,
    description: issue.description,
    priority: issue.priority,
    reopenTerminal: false,
    labelKey: issue.labelKey,
  });
  console.log(
    `${task.file}: ${result.action ?? 'failed'} ${result.url ?? result.reason ?? ''}`
  );
  if (result.ok !== false) {
    renameSync(join(dir, name), join(dir, 'filed', name));
    filed += 1;
  }
}
