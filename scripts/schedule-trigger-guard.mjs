#!/usr/bin/env node
/**
 * node scripts/schedule-trigger-guard.mjs  fail on newly added schedules or
 *                                          GitHub-API polling loops
 *
 * api-budget: github-actions-token 0/hr - reads the diff through git only; makes zero GitHub API calls (the detector patterns below are data, not calls).
 * Event-driven-only mandate (.claude/rules/event-driven.md, Tim 2026-10-21 +
 * 2026-11-14): a PR may not ADD a `schedule:`/`cron:` trigger, or a polling
 * loop against the GitHub API, unless the file is on
 * canon/automation-schedule-allowlist.json with a justification and a live
 * canon/automation-registry.jsonl id (automation-liveness keeps observing it).
 *
 * Deterministic, dependency-free, additive to the workflow-token-budget and
 * api-budget guards; loosens nothing. Diff base: the merge parent contained in
 * origin/main, else the merge-base with origin/main, else the event payload's
 * base SHA. A missing base is a documented skip, like external-api-guard.
 *
 * Polling detection is narrow: ADDED, non-comment lines must contain BOTH a
 * loop construct (while/until/setInterval) and a GitHub API construct (gh
 * api, api.github.com, octokit, github.rest, GraphQL). Test files are out of
 * scope (fixture-shaped content, like the raw-button ratchet's *.test.*
 * exclusion); anything else trips only until allowlisted with a
 * justification, which is the review the mandate asks for.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ALLOWLIST_PATH = 'canon/automation-schedule-allowlist.json';
export const ALLOWLIST_SCHEMA = 'jovie-automation-schedule-allowlist/v1';
export const REGISTRY_PATH = 'canon/automation-registry.jsonl';

export const WORKFLOW_SCOPE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
export const POLLING_SCOPE =
  /^(?:\.github\/(?:workflows|scripts)\/|scripts\/).*\.(?:mjs|js|py|sh|ya?ml)$/;

/**
 * Test files are out of scope for polling detection (fixture-shaped content);
 * the guard's own source embeds the detector patterns as regex data, not
 * calls, so it is out of scope too.
 */
export const POLLING_EXCLUDE =
  /(?:\.|\/)(?:test|spec)\.[a-z]+$|__tests__\/|scripts\/schedule-trigger-guard\.mjs$/;

/** A comment line (JS, shell, Python or YAML) never counts as polling evidence. */
export function isCommentLine(line) {
  return /^\s*(?:\/\/|\/\*|\*|#|--|<!--)/.test(line);
}

// All four trigger-declaration shapes: mapping (`schedule:`), list item
// (`- schedule`), array (`on: [push, schedule]`) and the cron entry itself.
export const SCHEDULE_LINE =
  /^\s*(?:-\s*cron:|schedule:|-\s*schedule\b)|\bon:\s*\[[^\]]*\bschedule\b/;
export const LOOP_CONSTRUCT =
  /\b(?:while\s*\(|while\s+true\b|until\b|setInterval\s*\(|for\s+await\b|for\s*\(\s*;)/;
export const GITHUB_API_CONSTRUCT =
  /\b(?:gh\s+(?:api|run\s+watch)|api\.github\.com|octokit|github\.rest\.|graphql\()/i;

/** @param {string} root */
function git(root, ...args) {
  const run = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return run.status === 0 ? run.stdout : null;
}

/** The PR's base SHA from the runner's event payload, when present. */
export function eventBaseSha(env = process.env) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path || !existsSync(path)) return null;
  try {
    return (
      JSON.parse(readFileSync(path, 'utf8'))?.pull_request?.base?.sha ?? null
    );
  } catch {
    return null;
  }
}

/** Parent SHAs recorded on `rev`. The objects themselves may be absent. */
export function commitParents(root, rev = 'HEAD') {
  const raw = git(root, 'cat-file', '-p', rev);
  if (!raw) return [];
  return [...raw.matchAll(/^parent ([0-9a-f]{40})$/gm)].map(match => match[1]);
}

function ensureCommit(root, sha) {
  if (git(root, 'cat-file', '-e', `${sha}^{commit}`) !== null) return true;
  return (
    git(root, 'fetch', '--quiet', '--depth=1', 'origin', sha) !== null &&
    git(root, 'cat-file', '-e', `${sha}^{commit}`) !== null
  );
}

function fetchOriginMain(root) {
  if (git(root, 'rev-parse', '--verify', 'refs/remotes/origin/main') !== null) {
    return;
  }
  if (git(root, 'fetch', '--quiet', '--depth=250', 'origin', 'main') === null) {
    return;
  }
  if (git(root, 'rev-parse', '--verify', 'refs/remotes/origin/main') !== null) {
    return;
  }
  // A single-branch clone (depth-1 PR checkout) records the fetch in
  // FETCH_HEAD and does not create refs/remotes/origin/main.
  const fetched = git(root, 'rev-parse', '--verify', 'FETCH_HEAD');
  if (!fetched) return;
  git(root, 'update-ref', 'refs/remotes/origin/main', fetched.trim());
}

/**
 * Base for a merge checkout. GitHub's pull merge ref lists the base first and
 * the PR head second. A local `git merge origin/main` lists them the other
 * way around. Prefer the parent that is contained in origin/main so main's
 * own cron lines are not reported as additions. A stale
 * `pull_request.base.sha` is not consulted here.
 * @returns {string | null}
 */
export function mergeRefBase(root) {
  const parents = commitParents(root);
  if (parents.length < 2) return null;
  fetchOriginMain(root);
  if (git(root, 'rev-parse', '--verify', 'refs/remotes/origin/main') === null) {
    return null;
  }
  for (const parent of parents) {
    if (!ensureCommit(root, parent)) continue;
    const onMain =
      git(root, 'merge-base', '--is-ancestor', parent, 'origin/main') !== null;
    if (onMain) return parent;
  }
  return null;
}

/**
 * Diff base: explicit env override, else the merge parent contained in
 * origin/main, else the merge-base with origin/main. A depth-1 one-parent
 * checkout cannot walk to main, so the event payload's base SHA is fetched
 * and used. A missing base degrades to the documented skip.
 */
export function diffBase(root, env = process.env) {
  if (env.TURBO_SCM_BASE) return env.TURBO_SCM_BASE;
  const fromMerge = mergeRefBase(root);
  if (fromMerge) return fromMerge;
  fetchOriginMain(root);
  const merged = git(root, 'merge-base', 'HEAD', 'origin/main');
  if (merged) return merged.trim();
  const base = eventBaseSha(env);
  if (
    base &&
    git(root, 'fetch', '--quiet', '--depth=1', 'origin', base) !== null
  ) {
    return base;
  }
  return null;
}

/**
 * Added lines per changed file, keyed by repo-relative path, for the diff
 * against `base`. `--unified=0` keeps only real +/- lines, already stripped
 * of the leading '+'.
 * @returns {Map<string, string[]>}
 */
export function collectAddedLines(root, base) {
  const files = (
    git(root, 'diff', '--name-only', '--diff-filter=ACMR', `${base}..HEAD`) ??
    ''
  )
    .split('\n')
    .filter(Boolean);
  const added = new Map();
  for (const file of files) {
    const patch =
      git(
        root,
        'diff',
        '--unified=0',
        '--diff-filter=ACMR',
        `${base}..HEAD`,
        '--',
        file
      ) ?? '';
    const lines = patch
      .split('\n')
      .filter(line => line.startsWith('+') && !line.startsWith('+++'))
      .map(line => line.slice(1));
    if (lines.length > 0) added.set(file, lines);
  }
  return added;
}

/** @param {string} root */
export function loadAllowlist(root) {
  const path = join(root, ALLOWLIST_PATH);
  if (!existsSync(path)) return [];
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return { invalid: `${ALLOWLIST_PATH} is not valid JSON` };
  }
  if (parsed?.schema !== ALLOWLIST_SCHEMA) {
    return {
      invalid: `${ALLOWLIST_PATH} must declare schema ${ALLOWLIST_SCHEMA}`,
    };
  }
  return Array.isArray(parsed.entries) ? parsed.entries : [];
}

/** @param {string} root */
export function liveRegistryIds(root) {
  const path = join(root, REGISTRY_PATH);
  if (!existsSync(path)) return new Set();
  const ids = new Set();
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry.status === 'live' && entry.id) ids.add(entry.id);
    } catch {
      // automation-registry.jsonl is validated elsewhere; skip bad lines here.
    }
  }
  return ids;
}

/**
 * Pure evaluation: given added lines per file, the allowlist and the live
 * registry ids, return the violation strings.
 * @param {{ added: Map<string, string[]>, allowlist: unknown, registryIds: Set<string> }} input
 * @returns {string[]}
 */
export function evaluateViolations({ added, allowlist, registryIds }) {
  if (allowlist && typeof allowlist === 'object' && 'invalid' in allowlist) {
    return [String(allowlist.invalid)];
  }
  const errors = [];
  const entries = Array.isArray(allowlist) ? allowlist : [];
  const allowlisted = new Map();
  for (const entry of entries) {
    if (!entry?.file || !entry?.justification || !entry?.registryId) {
      errors.push(
        `${ALLOWLIST_PATH}: every entry needs file, justification and registryId`
      );
      continue;
    }
    if (!registryIds.has(entry.registryId)) {
      errors.push(
        `${ALLOWLIST_PATH}: ${entry.registryId} is not a live canon/automation-registry.jsonl id`
      );
    }
    allowlisted.set(entry.file, entry);
  }
  for (const [file, lines] of added) {
    const codeLines = lines.filter(line => !isCommentLine(line));
    const newSchedule = codeLines.some(line => SCHEDULE_LINE.test(line));
    if (newSchedule && WORKFLOW_SCOPE.test(file) && !allowlisted.has(file)) {
      errors.push(
        `${file}: adds a schedule:/cron: trigger. Event-driven-only (Tim, 2026-10-21 + 2026-11-14): drive it from an event (workflow_run, pull_request, merge_group, check_suite, deployment_status, repository_dispatch, push), or add the file to ${ALLOWLIST_PATH} with a justification and a live registry id.`
      );
    }
    const polls =
      codeLines.some(line => LOOP_CONSTRUCT.test(line)) &&
      codeLines.some(line => GITHUB_API_CONSTRUCT.test(line));
    if (
      polls &&
      POLLING_SCOPE.test(file) &&
      !POLLING_EXCLUDE.test(file) &&
      !allowlisted.has(file)
    ) {
      errors.push(
        `${file}: adds a loop that re-reads the GitHub API (polling). Coalesce on the event or the entity (exact head SHA) instead, or add the file to ${ALLOWLIST_PATH} with a justification and a live registry id.`
      );
    }
  }
  return errors;
}

export function main(root = process.cwd(), env = process.env) {
  const base = diffBase(root, env);
  if (!base) {
    process.stdout.write(
      'schedule-trigger-guard: no diff base (origin/main); skipping\n'
    );
    return 0;
  }
  const added = collectAddedLines(root, base);
  const allowlist = loadAllowlist(root);
  const errors = evaluateViolations({
    added,
    allowlist,
    registryIds: liveRegistryIds(root),
  });
  for (const error of errors)
    process.stderr.write(`schedule-trigger-guard: ${error}\n`);
  process.stdout.write(
    `schedule-trigger-guard: ${errors.length ? 'FAIL' : 'ok'} base ${String(base).slice(0, 10)} (${added.size} changed file(s) with additions, ${
      Array.isArray(allowlist) ? allowlist.length : 0
    } allowlist entries)\n`
  );
  return errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  process.exitCode = main(root);
}
