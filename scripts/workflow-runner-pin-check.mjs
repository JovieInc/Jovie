#!/usr/bin/env node
/**
 * Fails when a workflow job runs on the floating `ubuntu-latest` image.
 *
 * On 2026-10-28 `ubuntu-latest` moved to 26.04, which Playwright does not
 * support, and every PR's browser jobs failed at once. Pin an explicit image
 * (for example `ubuntu-24.04`). Two rules:
 *
 *  - A job that installs or runs Playwright may never float, no exceptions.
 *  - Other floating jobs must be listed in .github/runner-pin-allowlist.json
 *    ("file#job"). The list is a ratchet: new floating jobs fail, and an entry
 *    that no longer floats must be removed.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FLOATING = /(?<![\w-])ubuntu-latest(?![\w.-])/u;

function usesPlaywright(job) {
  return (job.steps ?? []).some(
    step =>
      /setup-playwright/u.test(String(step?.uses ?? '')) ||
      /\bplaywright\b/u.test(String(step?.run ?? ''))
  );
}

function floats(job) {
  const haystack = JSON.stringify([job['runs-on'], job.strategy?.matrix ?? {}]);
  return FLOATING.test(haystack);
}

/** @returns {{ key: string, playwright: boolean }[]} */
export function findFloatingJobs(workflowsDir) {
  const found = [];
  for (const file of readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/u.test(file)) continue;
    const doc = yamlLoad(readFileSync(path.join(workflowsDir, file), 'utf8'));
    if (!doc || typeof doc !== 'object' || !('jobs' in doc)) continue;
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      if (job && floats(job))
        found.push({ key: `${file}#${id}`, playwright: usesPlaywright(job) });
    }
  }
  return found;
}

export function checkRunnerPins({
  workflowsDir = path.join(root, '.github/workflows'),
  allowlistPath = path.join(root, '.github/runner-pin-allowlist.json'),
} = {}) {
  const allowed = new Set(
    existsSync(allowlistPath)
      ? JSON.parse(readFileSync(allowlistPath, 'utf8')).jobs
      : []
  );
  const found = findFloatingJobs(workflowsDir);
  const floatingKeys = new Set(found.map(job => job.key));
  const errors = [];
  for (const job of found) {
    if (job.playwright)
      errors.push(
        `${job.key} runs Playwright on floating ubuntu-latest; pin runs-on to an explicit image such as ubuntu-24.04`
      );
    else if (!allowed.has(job.key))
      errors.push(
        `${job.key} uses floating ubuntu-latest; pin an explicit image such as ubuntu-24.04 (or, if unavoidable, add it to .github/runner-pin-allowlist.json)`
      );
  }
  for (const key of allowed)
    if (!floatingKeys.has(key))
      errors.push(
        `${key} is in runner-pin-allowlist.json but no longer floats; remove it`
      );
  return errors;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = checkRunnerPins();
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else console.log('workflow runner pins valid');
}
