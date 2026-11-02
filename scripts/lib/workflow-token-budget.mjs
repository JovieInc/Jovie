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

/** @param {string} source */
export function declaredBudget(source) {
  const match = DECLARATION.exec(source);
  return match ? { calls: Number(match[1]), reason: match[2].trim() } : null;
}

function isHosted(jobText) {
  const runsOn = /^\s*runs-on:\s*(.*(?:\n\s+[-\[].*)*)/m.exec(jobText);
  return !/self-hosted/i.test(runsOn?.[1] ?? '');
}

/**
 * Split a block of YAML text into step blocks. Dependency free on purpose: the
 * guard runs in PR Fleet Rules, which installs nothing. A step starts at a
 * "- " line at the indentation of the first list item under `steps:`.
 * @param {string} text
 * @returns {string[]}
 */
export function stepBlocks(text) {
  const lines = text.split('\n');
  const start = lines.findIndex(line => /^\s*steps:\s*$/.test(line));
  if (start < 0) return [];
  const stepsIndent = lines[start].search(/\S/);
  const blocks = [];
  let current = null;
  let itemIndent = null;
  for (const line of lines.slice(start + 1)) {
    const indent = line.search(/\S/);
    if (indent >= 0 && indent <= stepsIndent && !/^\s*#/.test(line)) break;
    if (
      indent >= 0 &&
      /^\s*- /.test(line) &&
      (itemIndent === null || indent === itemIndent)
    ) {
      itemIndent = indent;
      current = [line];
      blocks.push(current);
    } else if (current) current.push(line);
  }
  return blocks.map(block => block.join('\n'));
}

/**
 * @param {string[]} steps step blocks
 * @param {{ hosted: boolean, tokenInScope: boolean }} scope
 * @returns {Record<string, number>}
 */
export function countSteps(steps, { hosted, tokenInScope }) {
  const counts = empty();
  let primed = false;
  for (const raw of steps) {
    const text = raw
      .split('\n')
      .filter(line => !/^\s*#/.test(line))
      .join('\n');
    const uses =
      /^\s*(?:-\s+)?(?:name:.*\n\s+)?(?:if:.*\n\s+)?uses:\s*(\S+)/m.exec(
        text
      )?.[1] ?? '';
    const hasToken = TOKEN.test(text);
    if (uses.includes(PRIME_ACTION)) primed = true;
    if (uses.startsWith('actions/setup-node@') && hosted && !primed)
      counts['setup-node-manifest'] += 1;
    if (
      uses.startsWith('actions/github-script@') &&
      !/github-token:/.test(text)
    )
      counts['script-default-token'] += 1;
    if (
      /^\s*(?:-\s+)?(?:\w[\w-]*:.*\n\s+)*run:/m.test(text) &&
      API_CALL.test(text)
    ) {
      const tokenEnv = /\b(?:GH_TOKEN|GITHUB_TOKEN)\b/.test(text);
      if (hasToken || (tokenInScope && !tokenEnv))
        counts['token-api-call'] += 1;
    }
  }
  return counts;
}

const add = (a, b) => {
  for (const rule of RULES) a[rule] += b[rule] ?? 0;
  return a;
};
function empty() {
  return {
    'setup-node-manifest': 0,
    'script-default-token': 0,
    'token-api-call': 0,
  };
}

/**
 * @param {string} source workflow or composite-action YAML
 * @returns {Record<string, number>}
 */
export function countFile(source) {
  const total = empty();
  if (
    /^runs:\s*$/m.test(source) &&
    /^\s+using:\s*['"]?composite/m.test(source)
  ) {
    // Composite action: the caller's runner is unknown; assume hosted.
    return add(
      total,
      countSteps(stepBlocks(source), { hosted: true, tokenInScope: false })
    );
  }
  const jobsAt = source.search(/^jobs:\s*$/m);
  if (jobsAt < 0) return total;
  const head = source.slice(0, jobsAt);
  const workflowToken = TOKEN.test(
    /^env:\s*\n((?:[ \t]+.*\n?|\n)*)/m.exec(head)?.[1] ?? ''
  );
  const jobs = source.slice(jobsAt).split('\n').slice(1);
  /** @type {string[][]} */
  const groups = [];
  for (const line of jobs) {
    if (/^ {2}[\w-]+:\s*(?:#.*)?$/.test(line)) groups.push([line]);
    else if (groups.length) groups[groups.length - 1].push(line);
  }
  for (const group of groups) {
    const text = group.join('\n');
    const beforeSteps = text.split(/^\s*steps:\s*$/m)[0];
    const jobEnv =
      /^\s+env:\s*\n((?:\s{6,}.*\n?)*)/m.exec(beforeSteps)?.[1] ?? '';
    add(
      total,
      countSteps(stepBlocks(text), {
        hosted: isHosted(beforeSteps),
        tokenInScope: workflowToken || TOKEN.test(jobEnv),
      })
    );
  }
  return total;
}

/** @typedef {Record<string, number>} RuleCounts */
/** @typedef {Record<string, RuleCounts>} CountsByFile */
/** @typedef {Record<string, { calls: number, reason: string }>} DeclaredByFile */

/**
 * @param {string} root
 * @returns {{ found: CountsByFile, declared: DeclaredByFile }}
 */
export function scanRepo(root) {
  /** @type {CountsByFile} */
  const found = {};
  /** @type {DeclaredByFile} */
  const declared = {};
  /** @type {string[]} */
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
