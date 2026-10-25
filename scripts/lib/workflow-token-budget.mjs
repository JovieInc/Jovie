// Repo-wide GITHUB_TOKEN budget guard (2026-10-25).
//
// Actions' GITHUB_TOKEN gets about 1,000 REST calls an hour per repo, shared by
// every workflow. On 2026-10-25 demand was 5-7x that: each actions/setup-node
// spent a call on the node-versions manifest (10 per Source Validation run) and
// every PR event re-read PR evidence. The result was "API rate limit exceeded
// for installation" on Fleet Rules Evidence and PR Ready, every hour.
//
// This guard finds the places a workflow step spends that bucket without
// saying so, and lets the count only go down:
//
//   setup-node-manifest  a hosted setup-node with no prime-node-toolcache
//                        step before it in the same job
//   script-default-token an actions/github-script step without github-token
//   token-api-call       a run step that calls the GitHub API (gh, the api-client
//                        CLI, api.github.com) with github.token in scope
//
// A workflow that must spend the bucket declares it once, with a reason:
//
//   # github-token-budget: 6 calls/run - reads PR, files, PR for the verdict
//
// Undeclared sites are grandfathered in the ratchet file and only shrink.

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';

export const RATCHET_PATH = 'scripts/lib/workflow-token-budget.ratchet.json';
export const RATCHET_SCHEMA = 'jovie-workflow-token-budget-ratchet/v1';
export const PRIME_ACTION = 'prime-node-toolcache';
export const RULES = [
  'setup-node-manifest',
  'script-default-token',
  'token-api-call',
];

const DECLARATION =
  /^\s*#\s*github-token-budget:\s*(\d+)\s+calls\/run\s+-\s+(\S.*)$/m;
const TOKEN = /\bgithub\.token\b|secrets\.GITHUB_TOKEN\b/;
const API_CALL =
  /\bgh\s+(?:api|pr|run|issue|release|workflow|label|repo|search)\b|packages\/api-client\/cli|api\.github\.com|createGitHubClient|\bapiclient\b/;
const IGNORED_USES =
  /^(?:actions\/(?:checkout|cache|upload-artifact|download-artifact)|\.\/)/;

/** @param {string} source */
export function declaredBudget(source) {
  const match = DECLARATION.exec(source);
  return match ? { calls: Number(match[1]), reason: match[2].trim() } : null;
}

function isHosted(runsOn) {
  return !/self-hosted/i.test(JSON.stringify(runsOn ?? ''));
}

/**
 * @param {unknown[]} steps
 * @param {{ hosted: boolean, tokenInScope: boolean }} scope
 * @returns {Record<string, number>}
 */
export function countSteps(steps, { hosted, tokenInScope }) {
  const counts = {
    'setup-node-manifest': 0,
    'script-default-token': 0,
    'token-api-call': 0,
  };
  let primed = false;
  for (const raw of Array.isArray(steps) ? steps : []) {
    const step = /** @type {Record<string, any>} */ (raw ?? {});
    const uses = typeof step.uses === 'string' ? step.uses : '';
    if (uses.includes(PRIME_ACTION)) primed = true;
    if (uses.startsWith('actions/setup-node@') && hosted && !primed)
      counts['setup-node-manifest'] += 1;
    if (
      uses.startsWith('actions/github-script@') &&
      !step.with?.['github-token']
    )
      counts['script-default-token'] += 1;
    if (typeof step.run === 'string' && API_CALL.test(step.run)) {
      const stepEnv = JSON.stringify(step.env ?? {});
      if (
        TOKEN.test(stepEnv) ||
        (tokenInScope && !/GH_TOKEN|GITHUB_TOKEN/.test(stepEnv))
      )
        counts['token-api-call'] += 1;
    }
    if (
      uses &&
      !IGNORED_USES.test(uses) &&
      !uses.startsWith('actions/github-script@')
    ) {
      // A third-party action handed github.token for API reads.
      if (
        TOKEN.test(JSON.stringify(step.with ?? {})) &&
        API_CALL.test(JSON.stringify(step.with ?? {}))
      )
        counts['token-api-call'] += 1;
    }
  }
  return counts;
}

const add = (a, b) => {
  for (const rule of RULES) a[rule] += b[rule] ?? 0;
  return a;
};
const empty = () => ({
  'setup-node-manifest': 0,
  'script-default-token': 0,
  'token-api-call': 0,
});

/**
 * @param {string} source workflow or composite-action YAML
 * @returns {Record<string, number>}
 */
export function countFile(source) {
  const doc = /** @type {Record<string, any>} */ (load(source) ?? {});
  const total = empty();
  if (doc.runs?.steps) {
    // Composite action: the caller's runner is unknown; assume hosted.
    return add(
      total,
      countSteps(doc.runs.steps, { hosted: true, tokenInScope: false })
    );
  }
  const workflowToken = TOKEN.test(JSON.stringify(doc.env ?? {}));
  for (const job of Object.values(doc.jobs ?? {})) {
    const j = /** @type {Record<string, any>} */ (job ?? {});
    add(
      total,
      countSteps(j.steps, {
        hosted: isHosted(j['runs-on']),
        tokenInScope: workflowToken || TOKEN.test(JSON.stringify(j.env ?? {})),
      })
    );
  }
  return total;
}

/** @param {string} root */
export function scanRepo(root) {
  const found = {};
  const declared = {};
  const files = [];
  const workflows = join(root, '.github/workflows');
  if (existsSync(workflows))
    for (const name of readdirSync(workflows))
      if (/\.ya?ml$/.test(name)) files.push(`.github/workflows/${name}`);
  const actions = join(root, '.github/actions');
  if (existsSync(actions))
    for (const dir of readdirSync(actions))
      for (const name of ['action.yml', 'action.yaml'])
        if (existsSync(join(actions, dir, name)))
          files.push(`.github/actions/${dir}/${name}`);
  for (const path of files) {
    const source = readFileSync(join(root, path), 'utf8');
    let counts;
    try {
      counts = countFile(source);
    } catch {
      continue; // actionlint and the workflow load guard own parse errors
    }
    const nonzero = Object.fromEntries(
      Object.entries(counts).filter(([, n]) => n > 0)
    );
    if (Object.keys(nonzero).length) found[path] = nonzero;
    const budget = declaredBudget(source);
    if (budget) declared[path] = budget;
  }
  return { found, declared };
}

/**
 * @param {{ found: Record<string, Record<string, number>>, declared: Record<string, {calls:number, reason:string}>, ratchet: Record<string, Record<string, number>> }} input
 * @returns {string[]}
 */
export function check({ found, declared, ratchet }) {
  const errors = [];
  for (const [path, rules] of Object.entries(found)) {
    if (declared[path]) continue;
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = ratchet[path]?.[rule] ?? 0;
      if (count > allowed)
        errors.push(
          `${path}: ${rule} is ${count}, ratchet allows ${allowed}. ${HINTS[rule]} Or declare the spend once: "# github-token-budget: <N> calls/run - <reason>".`
        );
    }
  }
  for (const [path, budget] of Object.entries(declared))
    if (!(budget.calls >= 0))
      errors.push(`${path}: github-token-budget needs a call count`);
  return errors;
}

const HINTS = {
  'setup-node-manifest':
    'Add `uses: ./.github/actions/prime-node-toolcache` before actions/setup-node so Node comes from the toolcache, not a REST manifest call.',
  'script-default-token':
    'Pass `github-token:` from a minted App token, or move the read off GitHub.',
  'token-api-call':
    'Use the CI App read token, a git read, or batch the reads; github.token is a ~1,000/hour bucket shared by every workflow.',
};

/** Lower the ratchet to today's counts; never raises an entry. */
export function tighten(ratchet, found) {
  const next = {};
  for (const [path, rules] of Object.entries(found)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = ratchet[path]?.[rule];
      next[path] = {
        ...next[path],
        [rule]: allowed === undefined ? count : Math.min(allowed, count),
      };
    }
  }
  return next;
}

export function readRatchet(root) {
  const file = join(root, RATCHET_PATH);
  if (!existsSync(file)) return {};
  return JSON.parse(readFileSync(file, 'utf8')).entries ?? {};
}

export function writeRatchet(root, entries) {
  writeFileSync(
    join(root, RATCHET_PATH),
    `${JSON.stringify({ schema: RATCHET_SCHEMA, entries }, null, 2)}\n`
  );
}
