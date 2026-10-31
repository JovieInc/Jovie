// Rate limits as a planning input (ops/registry/rate-limits.json).
//
// A consumer states its expected load next to the code that makes the calls:
//   api-budget: github-app-core 120/hr - poll open PR checks every 30s for 1 PR
// (any comment syntax). The guard fails a PR that ADDS a new API consumer
// without such a line; scripts/rate-limit-headroom.mjs sums the declared
// budgets against each limit. Existing consumers are not retro-fitted.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const RATE_LIMITS_PATH = 'ops/registry/rate-limits.json';
const BUDGET =
  /api-budget:\s*([a-z0-9][a-z0-9-]*)\s+(\d+)\/hr(?:\s+-\s+(\S.*))?/g;
const TOKEN_BUDGET = /github-token-budget:\s*\d+/;
const SCHEDULED_WORKFLOW = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const SOURCE = /\.(?:ts|tsx|js|mjs|cjs|mts|cts|py|sh|bash)$/;
const NOT_CONSUMER =
  /(?:\.test\.|\.spec\.|\.stories\.|\.gen\.|\.d\.ts$|(?:^|\/)(?:__tests__|__mocks__|tests?|fixtures|node_modules|dist|build)\/|^packages\/api-client\/|^scripts\/apiclient\/)/;
const CLIENT_USE =
  /@jovie\/api-client|packages\/api-client|\bfrom\s+apiclient|\bimport\s+apiclient|\bcreate(?:GitHub|Linear|Api)Client\b|\brun_gh\b|\bGitHubClient\b|\bLinearClient\b|\brunGh\(/;

export function loadRateLimits(root) {
  return JSON.parse(readFileSync(join(root, RATE_LIMITS_PATH), 'utf8'));
}

/** @returns {{limit: string, perHour: number, reason: string}[]} */
export function parseBudgets(text) {
  return [...text.matchAll(BUDGET)].map(m => ({
    limit: m[1],
    perHour: Number(m[2]),
    reason: (m[3] ?? '').trim(),
  }));
}

/** Does this added file spend a budget that someone else also spends? */
export function isNewConsumer(path, text) {
  if (NOT_CONSUMER.test(path)) return false;
  if (SCHEDULED_WORKFLOW.test(path)) return /^\s*schedule:/m.test(text);
  return SOURCE.test(path) && CLIENT_USE.test(text);
}

export function addedFiles(base, root) {
  if (!base) return [];
  const diff = spawnSync(
    'git',
    ['diff', '--name-only', '--diff-filter=A', '-z', `${base}...HEAD`],
    { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  return diff.status === 0 ? diff.stdout.split('\0').filter(Boolean) : [];
}

/** @returns {string[]} errors; empty when every new consumer carries a valid budget line. */
export function checkNewConsumers({ added, read, limitIds }) {
  const errors = [];
  for (const path of added) {
    let text;
    try {
      text = read(path);
    } catch {
      continue;
    }
    if (!isNewConsumer(path, text)) continue;
    const budgets = parseBudgets(text);
    const legacy =
      SCHEDULED_WORKFLOW.test(path) &&
      TOKEN_BUDGET.test(text) &&
      limitIds.has('github-actions-token');
    if (budgets.length === 0 && !legacy) {
      errors.push(
        `${path}: new API consumer without a budget line. Add \`api-budget: <limit-id> <N>/hr - <reason>\` ` +
          `(limit ids: ${RATE_LIMITS_PATH}); the PR description states the same numbers. Contract: .claude/rules/rate-limits.md`
      );
      continue;
    }
    for (const b of budgets) {
      if (!limitIds.has(b.limit))
        errors.push(
          `${path}: api-budget names unknown limit "${b.limit}" (see ${RATE_LIMITS_PATH})`
        );
      if (b.reason.length < 10)
        errors.push(
          `${path}: api-budget ${b.limit} needs a reason (>= 10 chars) after " - "`
        );
    }
  }
  return errors;
}
