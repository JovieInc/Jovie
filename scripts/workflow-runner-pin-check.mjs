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

// A script a step runs can install Playwright itself (pen-golden-path.mjs
// runs `playwright install --with-deps`), so the step text alone misses it.
const INSTALLS_PLAYWRIGHT =
  /playwright['"]?\s*,?\s*['"]?install\b|playwright\s+install\b/u;

/**
 * Scripts a step runs through any interpreter (node, tsx, bash, python), plus
 * the relative modules they import one level down, may install Playwright.
 * @param {string} run @param {string} repoRoot
 */
function runsPlaywrightScript(run, repoRoot) {
  const seen = new Set();
  const scan = (/** @type {string} */ file, depth) => {
    const full = path.join(repoRoot, file);
    if (seen.has(full) || !existsSync(full)) return false;
    seen.add(full);
    const text = readFileSync(full, 'utf8');
    if (INSTALLS_PLAYWRIGHT.test(text)) return true;
    if (depth > 0) return false;
    const dir = path.dirname(file);
    return [...text.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/gu)].some(m =>
      scan(path.join(dir, m[1]), depth + 1)
    );
  };
  return [
    ...run.matchAll(
      /\b(?:node|tsx|bash|sh|python3?)\s+(?:--\S+\s+)*([\w./-]+\.(?:[cm]?[jt]s|sh|py))\b/gu
    ),
  ].some(([, file]) => scan(file, 0));
}

function usesPlaywright(job, repoRoot) {
  return (job.steps ?? []).some(
    step =>
      /setup-playwright/u.test(String(step?.uses ?? '')) ||
      /\bplaywright\b/u.test(String(step?.run ?? '')) ||
      runsPlaywrightScript(String(step?.run ?? ''), repoRoot)
  );
}

function floats(job) {
  const haystack = JSON.stringify([job['runs-on'], job.strategy?.matrix ?? {}]);
  return FLOATING.test(haystack);
}

/** @returns {{ key: string, playwright: boolean }[]} */
export function findFloatingJobs(workflowsDir, repoRoot = root) {
  const found = [];
  for (const file of readdirSync(workflowsDir).sort()) {
    if (!/\.ya?ml$/u.test(file)) continue;
    const doc = yamlLoad(readFileSync(path.join(workflowsDir, file), 'utf8'));
    if (!doc || typeof doc !== 'object' || !('jobs' in doc)) continue;
    for (const [id, job] of Object.entries(doc.jobs ?? {})) {
      if (job && floats(job))
        found.push({
          key: `${file}#${id}`,
          playwright: usesPlaywright(job, repoRoot),
        });
    }
  }
  return found;
}

export function checkRunnerPins({
  workflowsDir = path.join(root, '.github/workflows'),
  allowlistPath = path.join(root, '.github/runner-pin-allowlist.json'),
  repoRoot = root,
} = {}) {
  const allowed = new Set(
    existsSync(allowlistPath)
      ? JSON.parse(readFileSync(allowlistPath, 'utf8')).jobs
      : []
  );
  const found = findFloatingJobs(workflowsDir, repoRoot);
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
