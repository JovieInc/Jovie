#!/usr/bin/env node
// Files one bounded "strengthen test" Linear issue per module that has real
// survivors, from the task JSON the sweep wrote. Kept separate from the sweep
// so the only step that sees LINEAR_API_KEY never runs Stryker or repo tests.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  logRemediationDryRun,
  remediationTriggersEnabled,
  upsertLinearIssueByTitleFingerprint,
} from './lib/linear-issue-intake.mjs';
import { buildSurvivorIssue } from './lib/mutation-sweep.mjs';

/**
 * File one survivor issue for a task. Exported so tests (and the sweep's own
 * in-process filing) can drive the exact CLI behavior with a fake upsert.
 * @param {{ file: string, survivors: unknown[], score?: number|null, valid?: number, tests?: string[], sha?: string }} task
 * @param {{ runUrl?: string | null }} [options]
 */
export function buildSurvivorTaskIssue(task, { runUrl = null } = {}) {
  return buildSurvivorIssue(
    task.file,
    /** @type {Parameters<typeof buildSurvivorIssue>[1]} */ (task.survivors),
    {
      score: task.score,
      valid: task.valid,
      tests: task.tests ?? [],
      sha: task.sha,
      runUrl,
    }
  );
}

/**
 * The filing loop. Stops at the first `linear_rate_limited` result: filing
 * more survivors cannot succeed, and every retry starves the Fleet Gate /
 * Triage consumers of the same shared credential for longer (JOV-12500).
 * `filed` counts confirmed successful upserts. `unfiled` counts unsuccessful
 * or dry-run task files plus the raw unattempted filename tail after quota;
 * neither the task directory nor these counters prove missing Linear issues.
 * @param {{ tasksDir: string, runUrl?: string | null, upsert?: typeof upsertLinearIssueByTitleFingerprint, enabled?: boolean }} options
 * @returns {Promise<{ filed: number, unfiled: number }>}
 */
export async function fileSurvivorIssues(options) {
  const {
    tasksDir,
    runUrl = null,
    upsert = upsertLinearIssueByTitleFingerprint,
    enabled = remediationTriggersEnabled(process.env) &&
      Boolean(process.env.LINEAR_API_KEY),
  } = /** @type {any} */ (options);
  let names = [];
  try {
    names = readdirSync(tasksDir).filter(name => name.endsWith('.json'));
  } catch {
    console.log(`No survivor tasks at ${tasksDir}.`);
  }
  let filed = 0;
  let unfiled = 0;
  for (const [index, name] of names.sort().entries()) {
    const task = JSON.parse(readFileSync(join(tasksDir, name), 'utf8'));
    if (!Array.isArray(task.survivors) || task.survivors.length === 0) continue;
    const issue = buildSurvivorTaskIssue(task, { runUrl });
    if (!enabled) {
      logRemediationDryRun({
        action: 'upsert',
        key: 'mutation-survivors',
        fingerprint: issue.fingerprint,
      });
      unfiled += 1;
      continue;
    }
    const res = await upsert({
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
    if (res.reason === 'linear_rate_limited') {
      const remainingFiles = names.length - index;
      unfiled += remainingFiles;
      console.log(
        `Linear shared credential is rate-limited; stopping filing so the Fleet/Triage consumers keep their budget (${remainingFiles} task filename(s), including the current rate-limited file and unattempted tail; resets at ${res.resetAt ?? 'an unknown time'}).`
      );
      break;
    }
    if (res.ok === true) filed += 1;
    else unfiled += 1;
  }
  console.log(
    `${filed} survivor issue upsert(s) confirmed from ${names.length} task JSON filename(s); ${unfiled} task filename(s) not completed this pass (not a missing Linear issue count).`
  );
  return { filed, unfiled };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values } = parseArgs({
    options: {
      tasks: { type: 'string' },
      'run-url': { type: 'string' },
    },
  });
  if (!values.tasks) throw new Error('--tasks <dir> is required');
  await fileSurvivorIssues({
    tasksDir: values.tasks,
    runUrl: values['run-url'] ?? null,
  });
}
