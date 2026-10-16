#!/usr/bin/env node
/**
 * Static check: a job that mints a GitHub token must grant every scope its
 * scripts' GraphQL mutations and REST writes require.
 *
 * Tokens come from actions/create-github-app-token `permission-*` inputs or
 * from the job `permissions:` block (workflow-level permissions apply when
 * the job does not set its own). Calls are taken from the step's `run` /
 * github-script body and from the local scripts that step executes.
 *
 * Known merge-queue denials are acknowledged exceptions. Each one prints a
 * warning and does not fail the run. Every other mismatch fails. Removing a
 * live mismatch without removing its exception also fails.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const RANK = { read: 1, write: 2, admin: 3 };

/**
 * @typedef {Record<string, string>} PermissionSet
 * @typedef {{ all?: PermissionSet, any?: PermissionSet[] }} Requirement
 * @typedef {{ kind: 'scoped', permissions: PermissionSet | 'read-all' | 'write-all', label: string } | { kind: 'unscoped', label: string } | { kind: 'unrestricted', label: string }} TokenGrant
 * @typedef {{ call: string, index: number, kind: string, requirement: Requirement | null }} FoundCall
 */

/** Mutations whose required app permissions are known. */
export const GRAPHQL_MUTATIONS = {
  enqueuePullRequest: { all: { contents: 'write' } },
  // gh pr merge --auto on a merge-queue repo is fulfilled by enqueuePullRequest.
  // The client mutation still needs pull-requests plus the enqueue scope.
  enablePullRequestAutoMerge: {
    all: { contents: 'write', 'pull-requests': 'write' },
  },
  disablePullRequestAutoMerge: { all: { 'pull-requests': 'write' } },
  mergePullRequest: { all: { contents: 'write' } },
  dequeuePullRequest: { all: { 'merge-queues': 'write' } },
  updatePullRequest: { all: { 'pull-requests': 'write' } },
  updatePullRequestBranch: { all: { contents: 'write' } },
  markPullRequestReadyForReview: { all: { 'pull-requests': 'write' } },
  convertPullRequestToDraft: { all: { 'pull-requests': 'write' } },
  closePullRequest: { all: { 'pull-requests': 'write' } },
  reopenPullRequest: { all: { 'pull-requests': 'write' } },
  addPullRequestReview: { all: { 'pull-requests': 'write' } },
  createCommitOnBranch: { all: { contents: 'write' } },
};

const ISSUE_OR_PR = {
  any: [{ issues: 'write' }, { 'pull-requests': 'write' }],
};

/** @type {Array<{ method: string, path: RegExp, requirement: Requirement }>} */
const REST_RULES = [
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}statuses\/\{\}$/,
    requirement: { all: { statuses: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/comments$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}issues\/comments\/\{\}$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/labels$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/labels$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/labels(?:\/\{\})?$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}labels\/\{\}$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/assignees$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}issues\/\{\}\/assignees$/,
    requirement: ISSUE_OR_PR,
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/merge$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}pulls$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/reviews$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/requested_reviewers$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/requested_reviewers$/,
    requirement: { all: { 'pull-requests': 'write' } },
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}pulls\/\{\}\/update-branch$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}dispatches$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}actions\/workflows\/\{\}\/dispatches$/,
    requirement: { all: { actions: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}actions\/runs\/\{\}\/(?:cancel|rerun|force-cancel|approve)$/,
    requirement: { all: { actions: 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}actions\/artifacts\/\{\}$/,
    requirement: { all: { actions: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}git\/refs$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}git\/refs\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}git\/refs\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'PUT',
    path: /^repos\/(?:\{\}\/){1,2}contents\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'DELETE',
    path: /^repos\/(?:\{\}\/){1,2}contents\/.+$/,
    requirement: { all: { contents: 'write' } },
  },
  {
    method: 'POST',
    path: /^repos\/(?:\{\}\/){1,2}check-runs$/,
    requirement: { all: { checks: 'write' } },
  },
  {
    method: 'PATCH',
    path: /^repos\/(?:\{\}\/){1,2}check-runs\/\{\}$/,
    requirement: { all: { checks: 'write' } },
  },
];

/** @type {Record<string, Requirement>} */
const OCTOKIT_WRITES = {
  'repos.createCommitStatus': { all: { statuses: 'write' } },
  'repos.createDispatchEvent': { all: { contents: 'write' } },
  'repos.merge': { all: { contents: 'write' } },
  'repos.createOrUpdateFileContents': { all: { contents: 'write' } },
  'repos.deleteFile': { all: { contents: 'write' } },
  'issues.create': ISSUE_OR_PR,
  'issues.update': ISSUE_OR_PR,
  'issues.createComment': ISSUE_OR_PR,
  'issues.updateComment': ISSUE_OR_PR,
  'issues.deleteComment': ISSUE_OR_PR,
  'issues.addLabels': ISSUE_OR_PR,
  'issues.setLabels': ISSUE_OR_PR,
  'issues.removeLabel': ISSUE_OR_PR,
  'issues.addAssignees': ISSUE_OR_PR,
  'issues.removeAssignees': ISSUE_OR_PR,
  'pulls.create': { all: { 'pull-requests': 'write' } },
  'pulls.update': { all: { 'pull-requests': 'write' } },
  'pulls.merge': { all: { contents: 'write' } },
  'pulls.createReview': { all: { 'pull-requests': 'write' } },
  'pulls.requestReviewers': { all: { 'pull-requests': 'write' } },
  'pulls.removeRequestedReviewers': { all: { 'pull-requests': 'write' } },
  'pulls.updateBranch': { all: { contents: 'write' } },
  'actions.cancelWorkflowRun': { all: { actions: 'write' } },
  'actions.reRunWorkflow': { all: { actions: 'write' } },
  'actions.reRunWorkflowFailedJobs': { all: { actions: 'write' } },
  'actions.deleteArtifact': { all: { actions: 'write' } },
  'actions.createWorkflowDispatch': { all: { actions: 'write' } },
  'git.createRef': { all: { contents: 'write' } },
  'git.updateRef': { all: { contents: 'write' } },
  'git.deleteRef': { all: { contents: 'write' } },
  'checks.create': { all: { checks: 'write' } },
  'checks.update': { all: { checks: 'write' } },
};

const WRITE_METHOD =
  /^(create|update|delete|remove|add|merge|request|cancel|rerun|trigger|submit|dismiss|lock|unlock|set)/;

/**
 * Pre-existing rearm failure (run 38960318802, job 117173542106).
 * Scope changes are Tim-only; this check must not edit the token.
 * @type {ReadonlyArray<{ id: string, workflow: string, job: string, call: string, missing: string[], message: string }>}
 */
export const ACKNOWLEDGED_MISMATCHES = [
  {
    id: 'rearm-enqueue-contents-read',
    workflow: '.github/workflows/merge-queue-green-enroll.yml',
    job: 'rearm-green-victims',
    call: 'enqueuePullRequest',
    missing: ['contents:write'],
    message:
      'rearm-green-victims mints jovie-bot (app 2934433) with permission-contents: read but calls enqueuePullRequest via scripts/merge-group-victim-rearm.mjs. enqueuePullRequest needs contents: write. Tim must approve permission-contents: write on that rearm token. This check does not change scopes.',
  },
  {
    id: 'hold-dequeue-without-merge-queues',
    workflow: '.github/workflows/merge-queue-green-enroll.yml',
    job: 'hold-failed-revision',
    call: 'dequeuePullRequest',
    missing: ['merge-queues:write'],
    message:
      'hold-failed-revision calls dequeuePullRequest from scripts/merge-group-failure-hold.mjs without merge-queues: write. The workflow documents that denial as non-fatal and says not to add permission-merge-queues unless the jovie-bot installation already has it, because an ungranted permission fails token mint before the hold is written. Tim must approve any scope change. This check does not change scopes.',
  },
  {
    id: 'dequeue-held-without-merge-queues',
    workflow: '.github/workflows/merge-queue-green-enroll.yml',
    job: 'dequeue-held',
    call: 'dequeuePullRequest',
    missing: ['merge-queues:write'],
    message:
      'dequeue-held calls dequeuePullRequest with contents: write and pull-requests: write, not merge-queues: write. The step catches the denial. Tim must approve permission-merge-queues: write if that dequeue should succeed. This check does not change scopes.',
  },
];

const SCRIPT_PATH =
  /(?:^|[\s'"`=(])(\.?\/?(?:[A-Za-z0-9_.-]+\/)*?(?:scripts|\.github\/scripts)\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|sh))(?=$|[\s'"`);,&|])/g;
const MUTATION_FIELD = new RegExp(
  `\\b(${Object.keys(GRAPHQL_MUTATIONS).join('|')})\\s*\\(`,
  'g'
);
const MUTATION_BLOCK = /\bmutation\b(?:\s*\([^)]*\))?\s*\{/g;
const OCTOKIT_CALL =
  /\b(?:github|octokit)\.rest\.([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\s*\(/g;

/**
 * @param {string} source
 * @param {number} index
 */
function lineOf(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * @param {string} haystack
 * @param {string} needle
 */
function lineOffsetIn(haystack, needle) {
  const trimmed = needle.trim();
  if (!trimmed) return 0;
  const exact = haystack.indexOf(trimmed);
  if (exact >= 0) return lineOf(haystack, exact) - 1;
  const lines = needle.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const probe = (lines[index] ?? '').trim();
    if (probe.length < 16) continue;
    const at = haystack.indexOf(probe);
    if (at < 0) continue;
    return lineOf(haystack, at) - 1 - index;
  }
  return 0;
}

/**
 * @param {unknown} value
 * @returns {PermissionSet | 'read-all' | 'write-all' | null}
 */
export function normalizePermissions(value) {
  if (typeof value === 'string') {
    if (value === 'read-all' || value === 'write-all') return value;
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  /** @type {PermissionSet} */
  const out = {};
  for (const [key, level] of Object.entries(value)) {
    if (typeof level !== 'string') continue;
    out[key.replaceAll('_', '-')] = level;
  }
  return out;
}

/**
 * @param {PermissionSet | 'read-all' | 'write-all'} permissions
 * @param {string} name
 */
function grantedRank(permissions, name) {
  if (permissions === 'write-all') return RANK.admin;
  if (permissions === 'read-all') return RANK.read;
  const level = permissions[name];
  return RANK[/** @type {'read'} */ (level)] ?? 0;
}

/**
 * @param {PermissionSet | 'read-all' | 'write-all'} permissions
 * @param {Requirement} requirement
 * @returns {string[]} missing `permission:level` entries, empty when granted
 */
export function missingPermissions(permissions, requirement) {
  const sets = requirement.any ?? [requirement.all ?? {}];
  /** @type {string[] | null} */
  let best = null;
  for (const set of sets) {
    /** @type {string[]} */
    const missing = [];
    for (const [name, level] of Object.entries(set)) {
      const needed = RANK[/** @type {'read'} */ (level)] ?? 0;
      if (grantedRank(permissions, name) < needed)
        missing.push(`${name}:${level}`);
    }
    if (missing.length === 0) return [];
    if (!best || missing.length < best.length) best = missing;
  }
  return best ?? [];
}

/**
 * @param {string} raw
 */
const REST_STATIC_SEGMENTS = new Set([
  'actions',
  'approve',
  'artifacts',
  'assignees',
  'branches',
  'cancel',
  'check-runs',
  'check-suites',
  'comments',
  'commits',
  'contents',
  'dispatches',
  'force-cancel',
  'git',
  'graphql',
  'issues',
  'labels',
  'merge',
  'orgs',
  'pulls',
  'refs',
  'repos',
  'requested_reviewers',
  'rerun',
  'reviews',
  'runs',
  'statuses',
  'update-branch',
  'user',
  'users',
  'workflows',
]);

export function normalizeRestPath(raw) {
  let value = String(raw).split('?')[0] ?? '';
  value = value.replace(/^https:\/\/api\.github\.com\//, '');
  value = value.replace(/\$\{[^}]+\}/g, '{}');
  value = value.replace(/\$[A-Za-z_][A-Za-z0-9_]*/g, '{}');
  value = value.replace(/\{[^}]+\}/g, '{}');
  value = value.replace(/\/[0-9a-f]{7,40}(?=\/|$)/g, '/{}');
  value = value.replace(/\/\d+(?=\/|$)/g, '/{}');
  value = value
    .split('/')
    .map(segment =>
      segment === '{}' || REST_STATIC_SEGMENTS.has(segment) ? segment : '{}'
    )
    .join('/');
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * @param {string} method
 * @param {string} rawPath
 * @returns {{ call: string, requirement: Requirement | null }}
 */
function restRequirement(method, rawPath) {
  const normalized = normalizeRestPath(rawPath);
  const call = `${method} ${normalized}`;
  if (normalized === 'graphql' || normalized.endsWith('/graphql')) {
    return { call, requirement: null };
  }
  const rule = REST_RULES.find(
    item => item.method === method && item.path.test(normalized)
  );
  return { call, requirement: rule ? rule.requirement : null };
}

/**
 * @param {string} source
 * @param {number} openIndex index of `{` or `[`
 * @param {string} open
 * @param {string} close
 */
function matchingDelimiter(source, openIndex, open, close) {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let i = openIndex; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\' && quote !== "'") escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Replace comments with spaces so later indexes still point at the source.
 * @param {string} source
 * @param {'js' | 'shell'} kind
 */
export function maskComments(source, kind) {
  let out = '';
  let quote = '';
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];
    if (quote) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\' && quote !== "'") escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      out += char;
      continue;
    }
    if (kind === 'js' && char === '/' && next === '/') {
      out += '  ';
      i += 2;
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      i -= 1;
      continue;
    }
    if (kind === 'js' && char === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (
        i < source.length &&
        !(source[i] === '*' && source[i + 1] === '/')
      ) {
        out += source[i] === '\n' ? '\n' : ' ';
        i += 1;
      }
      if (i < source.length) {
        out += '  ';
        i += 1;
      }
      continue;
    }
    if (kind === 'shell' && char === '#') {
      out += ' ';
      i += 1;
      while (i < source.length && source[i] !== '\n') {
        out += ' ';
        i += 1;
      }
      i -= 1;
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * @param {string} source
 * @param {(text: string, index: number) => void} visit
 */
function forEachJsString(source, visit) {
  let quote = '';
  let start = -1;
  let escaped = false;
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      if (quote === '`' && char === '$' && source[i + 1] === '{') {
        const end = matchingDelimiter(source, i + 1, '{', '}');
        if (end >= 0) {
          i = end;
          continue;
        }
      }
      if (escaped) escaped = false;
      else if (char === '\\' && quote !== "'") escaped = true;
      else if (char === quote) {
        visit(source.slice(start + 1, i), start + 1);
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      start = i;
    }
  }
}

/**
 * @param {string} source
 * @returns {string[]}
 */
export function splitShellCommands(source) {
  /** @type {string[]} */
  const commands = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quote) {
      current += char;
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      current += char;
      continue;
    }
    if (char === '\\' && source[i + 1] === '\n') continue;
    if (
      char === '\n' ||
      char === ';' ||
      (char === '&' && source[i + 1] === '&') ||
      (char === '|' && source[i + 1] === '|')
    ) {
      if (current.trim()) commands.push(current);
      current = '';
      if (char !== '\n' && char !== ';') i += 1;
      continue;
    }
    current += char;
  }
  if (current.trim()) commands.push(current);
  return commands;
}

/**
 * @param {string} command
 * @returns {string | null} env var name assigned to GH_TOKEN for this command
 */
function ghTokenOverride(command) {
  const match =
    /\bGH_TOKEN=(?:"\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?"|'\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?'|\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?)/.exec(
      command
    );
  if (!match) return null;
  return match[1] || match[2] || match[3] || null;
}

/**
 * @param {string[]} tokens
 * @returns {{ method: string, path: string } | null}
 */
function ghApiFromTokens(tokens) {
  const api = tokens.findIndex(token => token === 'api');
  if (api < 0) return null;
  let method = '';
  /** @type {string[]} */
  const positionals = [];
  let sawField = false;
  for (let i = api + 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === '-X' || token === '--method') {
      method = (tokens[i + 1] ?? '').toUpperCase();
      i += 1;
      continue;
    }
    if (token.startsWith('--method=')) {
      method = token.slice('--method='.length).toUpperCase();
      continue;
    }
    if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase();
      continue;
    }
    if (
      token === '-f' ||
      token === '-F' ||
      token === '--raw-field' ||
      token === '--input' ||
      token.startsWith('-f') ||
      token.startsWith('-F')
    ) {
      sawField = true;
      if (token === '-f' || token === '-F' || token === '--raw-field') i += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    positionals.push(token);
  }
  const rawPath = positionals.find(
    token => token.includes('/') || token === 'graphql'
  );
  if (!rawPath) return null;
  const verb = method || (sawField ? 'POST' : 'GET');
  return { method: verb, path: rawPath };
}

/**
 * @param {string} command
 * @returns {string[]}
 */
function shellTokens(command) {
  /** @type {string[]} */
  const tokens = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * String literals inside a `gh([ ... ])` or `execFileSync('gh', [ ... ])` array.
 * @param {string} source
 * @returns {Array<{ tokens: string[], index: number }>}
 */
function ghArgumentArrays(source) {
  /** @type {Array<{ tokens: string[], index: number }>} */
  const found = [];
  const starts = [
    ...source.matchAll(/\bgh\s*\(\s*\[/g),
    ...source.matchAll(/\bexecFile(?:Sync)?\s*\(\s*['"]gh['"]\s*,\s*\[/g),
  ];
  for (const start of starts) {
    const bracket = source.indexOf('[', start.index);
    const end = matchingDelimiter(source, bracket, '[', ']');
    if (end < 0) continue;
    const body = source.slice(bracket + 1, end);
    /** @type {string[]} */
    const tokens = [];
    for (const literal of body.matchAll(/'([^'\\]*)'|"([^"\\]*)"|`([^`]*)`/g)) {
      tokens.push(literal[1] ?? literal[2] ?? literal[3] ?? '');
    }
    if (
      tokens.includes('api') ||
      tokens.includes('pr') ||
      tokens.includes('merge')
    )
      found.push({ tokens, index: start.index });
  }
  return found;
}

/**
 * GraphQL mutations count only inside string literals, so a JS call such as
 * `io.dequeuePullRequest(id)` is not treated as the GraphQL field.
 * @param {string} source
 * @param {FoundCall[]} calls
 */
function pushGraphqlStrings(source, calls) {
  forEachJsString(source, (text, index) => {
    for (const match of text.matchAll(MUTATION_FIELD)) {
      const name = match[1] ?? '';
      calls.push({
        call: name,
        index: index + (match.index ?? 0),
        kind: 'graphql',
        requirement:
          GRAPHQL_MUTATIONS[
            /** @type {keyof typeof GRAPHQL_MUTATIONS} */ (name)
          ] ?? null,
      });
    }
    for (const match of text.matchAll(MUTATION_BLOCK)) {
      const after = text.slice((match.index ?? 0) + match[0].length);
      const field = /^[\s\n]*([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(after);
      const name = field?.[1];
      if (!name || name in GRAPHQL_MUTATIONS) continue;
      calls.push({
        call: name,
        index: index + (match.index ?? 0),
        kind: 'graphql-unmapped',
        requirement: null,
      });
    }
  });
}

/**
 * @param {string} source
 * @param {'js' | 'shell'} mode
 * @returns {FoundCall[]}
 */
export function extractCalls(source, mode = 'js') {
  const masked = maskComments(source, mode);
  /** @type {FoundCall[]} */
  const calls = [];
  pushGraphqlStrings(masked, calls);

  if (mode === 'js') {
    for (const match of masked.matchAll(OCTOKIT_CALL)) {
      const name = `${match[1]}.${match[2]}`;
      const method = match[2] ?? '';
      if (!WRITE_METHOD.test(method) && !OCTOKIT_WRITES[name]) continue;
      calls.push({
        call: name,
        index: match.index ?? 0,
        kind: 'octokit',
        requirement: OCTOKIT_WRITES[name] ?? null,
      });
    }
    for (const request of masked.matchAll(
      /\.request\(\s*['"`](POST|PUT|PATCH|DELETE)\s+([^'"`\s]+)/g
    )) {
      const method = request[1] ?? 'POST';
      const resolved = restRequirement(method, request[2] ?? '');
      calls.push({
        call: resolved.call,
        index: request.index ?? 0,
        kind: 'rest',
        requirement: resolved.requirement,
      });
    }
    for (const array of ghArgumentArrays(masked)) {
      pushGhTokens(calls, array.tokens, array.index);
    }
    return calls;
  }

  for (const command of splitShellCommands(masked)) {
    const at = masked.indexOf(command);
    const ghAt = command.search(/\bgh\s+/);
    if (ghAt < 0) continue;
    const tokens = shellTokens(command.slice(ghAt));
    pushGhTokens(calls, tokens, (at < 0 ? 0 : at) + ghAt);
  }
  return calls;
}

/**
 * @param {FoundCall[]} calls
 * @param {string[]} tokens
 * @param {number} index
 */
function pushGhTokens(calls, tokens, index) {
  const api = ghApiFromTokens(tokens);
  if (
    api &&
    api.method !== 'GET' &&
    !normalizeRestPath(api.path).includes('graphql')
  ) {
    const resolved = restRequirement(api.method, api.path);
    calls.push({
      call: resolved.call,
      index,
      kind: 'rest',
      requirement: resolved.requirement,
    });
  }
  const merge = classifyGhPrMerge(tokens);
  if (merge) {
    calls.push({
      call: merge,
      index,
      kind: 'cli',
      requirement:
        GRAPHQL_MUTATIONS[
          /** @type {keyof typeof GRAPHQL_MUTATIONS} */ (merge)
        ] ?? null,
    });
  }
  if (classifyGhPrEdit(tokens)) {
    calls.push({
      call: 'gh pr edit',
      index,
      kind: 'cli',
      requirement: ISSUE_OR_PR,
    });
  }
}

/**
 * @param {string[]} tokens
 * @returns {keyof typeof GRAPHQL_MUTATIONS | null}
 */
function classifyGhPrMerge(tokens) {
  const pr = tokens.indexOf('pr');
  if (pr < 0 || tokens[pr + 1] !== 'merge') return null;
  const flags = tokens.slice(pr + 2);
  if (flags.some(token => token === '--disable-auto' || token === '--undo'))
    return 'disablePullRequestAutoMerge';
  if (flags.some(token => token === '--auto')) return 'enqueuePullRequest';
  if (
    flags.some(token =>
      ['--squash', '--merge', '--rebase', '-s', '-m', '-r'].includes(token)
    )
  )
    return 'mergePullRequest';
  return 'mergePullRequest';
}

/**
 * @param {string[]} tokens
 * @returns {boolean}
 */
function classifyGhPrEdit(tokens) {
  const pr = tokens.indexOf('pr');
  return pr >= 0 && tokens[pr + 1] === 'edit';
}

/**
 * Checkout prefixes such as `.fx-policy/scripts/...` still name a repo script.
 * @param {string} token
 * @returns {string | null}
 */
export function repoScriptPath(token) {
  const cleaned = token.replace(/^\.\//, '');
  const match = cleaned.match(
    /(?:^|\/)((?:scripts|\.github\/scripts)\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|sh))$/
  );
  const repoPath = match?.[1] ?? '';
  if (!repoPath || repoPath.includes('.test.')) return null;
  return repoPath;
}

/**
 * @param {string} text
 * @returns {string[]}
 */
export function scriptPathsIn(text) {
  /** @type {Set<string>} */
  const paths = new Set();
  for (const match of text.matchAll(SCRIPT_PATH)) {
    const repoPath = repoScriptPath(match[1] ?? '');
    if (repoPath) paths.add(repoPath);
  }
  return [...paths];
}

const NODE_FLAG_WITH_VALUE = new Set([
  '-r',
  '--require',
  '--experimental-loader',
  '--loader',
  '--import',
  '-C',
  '--conditions',
]);
const CALL_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'function',
  'return',
  'await',
  'typeof',
  'new',
  'do',
  'else',
]);

/**
 * @param {string} command
 * @returns {{ script: string, subcommand: string } | null}
 */
export function nodeInvocation(command) {
  const tokens = shellTokens(command);
  const nodeAt = tokens.findIndex(
    token => token === 'node' || token.endsWith('/node')
  );
  if (nodeAt < 0) return null;
  let script = '';
  for (let i = nodeAt + 1; i < tokens.length; i += 1) {
    const token = tokens[i] ?? '';
    if (token === '--') continue;
    if (NODE_FLAG_WITH_VALUE.has(token)) {
      i += 1;
      continue;
    }
    if (token.startsWith('-')) continue;
    if (!script) {
      script = repoScriptPath(token) ?? '';
      continue;
    }
    if (token.startsWith('-')) continue;
    return { script, subcommand: token };
  }
  return script ? { script, subcommand: '' } : null;
}

/**
 * A multi-command CLI only "makes" the calls its invoked subcommand can reach.
 * When the dispatch is not visible, the whole file stays in scope.
 * @param {string} source
 * @param {string} subcommand
 * @returns {string}
 */
export function sourceForSubcommand(source, subcommand) {
  if (!subcommand) return source;
  const escaped = subcommand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const handlers = [
    ...source.matchAll(
      new RegExp(
        `['"]${escaped}['"][\\s\\S]{0,200}?\\breturn\\s+([A-Za-z_$][\\w$]*)\\s*\\(`,
        'g'
      )
    ),
  ].flatMap(match => (match[1] ? [match[1]] : []));
  if (handlers.length === 0) return source;
  /** @type {Array<{ start: number, end: number }>} */
  const ranges = [];
  /** @type {string[]} */
  const queue = [...handlers];
  const seen = new Set();
  while (queue.length > 0 && seen.size < 40) {
    const name = queue.shift();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const range = functionRange(source, name);
    if (!range) continue;
    ranges.push(range);
    const body = source.slice(range.start, range.end + 1);
    for (const match of body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)) {
      const callee = match[1] ?? '';
      if (!callee || CALL_KEYWORDS.has(callee) || seen.has(callee)) continue;
      if (functionRange(source, callee)) queue.push(callee);
    }
    for (const match of body.matchAll(/\b([A-Z][A-Z0-9_]+)\b/g)) {
      const constant = stringConstRange(source, match[1] ?? '');
      if (constant) ranges.push(constant);
    }
  }
  if (ranges.length === 0) return source;
  return maskOutside(source, ranges);
}

/**
 * @param {string} source
 * @param {string} name
 * @returns {{ start: number, end: number } | null}
 */
function functionRange(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declared = new RegExp(
    `(?:async\\s+function\\s+${escaped}\\s*\\(|function\\s+${escaped}\\s*\\(|(?:const|let|var)\\s+${escaped}\\s*=\\s*(?:async\\s*)?(?:function\\s*)?\\()`
  ).exec(source);
  if (!declared || declared.index == null) return null;
  const paren = declared.index + declared[0].lastIndexOf('(');
  const closeParen = matchingDelimiter(source, paren, '(', ')');
  if (closeParen < 0) return null;
  let cursor = closeParen + 1;
  while (cursor < source.length && /\s/.test(source[cursor] ?? '')) cursor += 1;
  if (source.startsWith('=>', cursor)) {
    cursor += 2;
    while (cursor < source.length && /\s/.test(source[cursor] ?? ''))
      cursor += 1;
  }
  if (source[cursor] !== '{') {
    const lineEnd = source.indexOf('\n', cursor);
    return {
      start: declared.index,
      end: lineEnd < 0 ? source.length - 1 : lineEnd,
    };
  }
  const end = matchingDelimiter(source, cursor, '{', '}');
  if (end < 0) return null;
  return { start: declared.index, end };
}

/**
 * @param {string} source
 * @param {string} name
 * @returns {{ start: number, end: number } | null}
 */
function stringConstRange(source, name) {
  if (!name) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const declared = new RegExp(
    `(?:const|let|var)\\s+${escaped}\\s*=\\s*(['"\`])`
  ).exec(source);
  if (!declared || declared.index == null) return null;
  const quote = declared[1] ?? '';
  const valueStart = declared.index + declared[0].length;
  let cursor = valueStart;
  let escapedChar = false;
  while (cursor < source.length) {
    const char = source[cursor] ?? '';
    if (quote === '`' && char === '$' && source[cursor + 1] === '{') {
      const end = matchingDelimiter(source, cursor + 1, '{', '}');
      if (end < 0) return null;
      cursor = end + 1;
      continue;
    }
    if (escapedChar) escapedChar = false;
    else if (char === '\\' && quote !== "'") escapedChar = true;
    else if (char === quote) return { start: declared.index, end: cursor };
    cursor += 1;
  }
  return null;
}

/**
 * @param {string} source
 * @param {Array<{ start: number, end: number }>} ranges
 */
function maskOutside(source, ranges) {
  const keep = new Uint8Array(source.length);
  for (const range of ranges) {
    const end = Math.min(source.length - 1, range.end);
    for (let i = Math.max(0, range.start); i <= end; i += 1) keep[i] = 1;
  }
  let out = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i] ?? '';
    out += keep[i] || char === '\n' ? char : ' ';
  }
  return out;
}

/**
 * @param {string} root
 * @param {string} repoPath
 * @param {Map<string, string>} cache
 */
function readRepoFile(root, repoPath, cache) {
  const abs = path.join(root, repoPath);
  if (cache.has(abs)) return cache.get(abs) ?? '';
  const text = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
  cache.set(abs, text);
  return text;
}

/**
 * @param {Record<string, unknown>} step
 * @returns {PermissionSet | null} null when the step does not narrow the installation grant
 */
function appTokenPermissions(step) {
  const uses = String(step.uses ?? '');
  if (!uses.includes('create-github-app-token')) return null;
  const withInputs = /** @type {Record<string, unknown>} */ (step.with ?? {});
  /** @type {PermissionSet} */
  const permissions = {};
  let narrowed = false;
  for (const [key, value] of Object.entries(withInputs)) {
    if (!key.startsWith('permission-') || typeof value !== 'string') continue;
    narrowed = true;
    permissions[key.slice('permission-'.length).replaceAll('_', '-')] = value;
  }
  return narrowed ? permissions : null;
}

/**
 * @param {unknown} expr
 * @param {Map<string, PermissionSet | null>} appTokens
 * @returns {{ kind: 'app', id: string } | { kind: 'github' } | null}
 */
function tokenRef(expr, appTokens) {
  const text = String(expr ?? '');
  const step = /steps\.([A-Za-z0-9_-]+)\.outputs\.token/.exec(text);
  if (step?.[1] && appTokens.has(step[1])) return { kind: 'app', id: step[1] };
  if (/github\.token|secrets\.GITHUB_TOKEN/.test(text))
    return { kind: 'github' };
  return null;
}

/**
 * @param {PermissionSet | 'read-all' | 'write-all' | null} permissions
 * @param {string} label
 * @returns {TokenGrant}
 */
function grant(permissions, label) {
  if (permissions == null) return { kind: 'unrestricted', label };
  return { kind: 'scoped', permissions, label };
}

/**
 * @param {string} workflow
 * @param {string} job
 * @param {string} call
 * @param {string[]} missing
 * @param {ReadonlyArray<{ id: string, workflow: string, job: string, call: string, missing: string[], message: string }>} acknowledged
 */
function matchAcknowledged(workflow, job, call, missing, acknowledged) {
  const key = [...missing].sort().join(',');
  return acknowledged.find(
    item =>
      item.workflow === workflow &&
      item.job === job &&
      item.call === call &&
      [...item.missing].sort().join(',') === key
  );
}

/**
 * @param {string} root
 * @param {{ acknowledged?: typeof ACKNOWLEDGED_MISMATCHES, requireAcknowledged?: boolean }} [options]
 */
export function scanWorkflowTokenScopes(root, options = {}) {
  const acknowledged = options.acknowledged ?? ACKNOWLEDGED_MISMATCHES;
  const requireAcknowledged =
    options.requireAcknowledged ?? acknowledged === ACKNOWLEDGED_MISMATCHES;
  const workflowDir = path.join(root, '.github', 'workflows');
  /** @type {Map<string, string>} */
  const cache = new Map();
  /** @type {Array<{ workflow: string, job: string, call: string, missing: string[], file: string, line: number, token: string, message: string, acknowledged: boolean }>} */
  const mismatches = [];
  /** @type {Array<{ workflow: string, job: string, call: string, file: string, line: number }>} */
  const gaps = [];
  /** @type {Set<string>} */
  const seen = new Set();
  /** @type {Set<string>} */
  const seenGaps = new Set();
  let calls = 0;
  const usedAcknowledgements = new Set();

  if (!existsSync(workflowDir)) {
    return { calls, mismatches, gaps, warnings: [], failures: [] };
  }

  const workflowFiles = readdirSync(workflowDir)
    .filter(file => /\.ya?ml$/.test(file))
    .sort();

  for (const fileName of workflowFiles) {
    const workflowPath = `.github/workflows/${fileName}`;
    const raw = readRepoFile(root, workflowPath, cache);
    /** @type {any} */
    let parsed;
    try {
      parsed = loadYaml(raw) ?? {};
    } catch (error) {
      mismatches.push({
        workflow: workflowPath,
        job: '',
        call: 'workflow-yaml',
        missing: [],
        file: workflowPath,
        line: 1,
        token: '',
        message: `${workflowPath} is not valid workflow YAML: ${error instanceof Error ? error.message : String(error)}`,
        acknowledged: false,
      });
      continue;
    }
    const workflowPermissions = Object.hasOwn(parsed, 'permissions')
      ? normalizePermissions(parsed.permissions)
      : null;
    const jobs = parsed.jobs;
    if (!jobs || typeof jobs !== 'object') continue;

    for (const [jobId, job] of Object.entries(jobs)) {
      if (!job || typeof job !== 'object') continue;
      const jobRecord = /** @type {Record<string, any>} */ (job);
      const steps = Array.isArray(jobRecord.steps) ? jobRecord.steps : [];
      /** @type {Map<string, PermissionSet | null>} */
      const appTokens = new Map();
      for (const step of steps) {
        if (!step || typeof step !== 'object' || !step.id) continue;
        const uses = String(step.uses ?? '');
        if (!uses.includes('create-github-app-token')) continue;
        appTokens.set(String(step.id), appTokenPermissions(step));
      }
      if (
        appTokens.size === 0 &&
        !Object.hasOwn(jobRecord, 'permissions') &&
        workflowPermissions == null
      ) {
        continue;
      }
      const jobPermissions = Object.hasOwn(jobRecord, 'permissions')
        ? normalizePermissions(jobRecord.permissions)
        : workflowPermissions;
      const githubGrant = grant(jobPermissions, 'GITHUB_TOKEN');

      /**
       * @param {unknown} stepEnv
       * @param {Map<string, TokenGrant>} envGrants
       */
      const considerStepEnv = (stepEnv, envGrants) => {
        if (!stepEnv || typeof stepEnv !== 'object') return;
        for (const [name, value] of Object.entries(stepEnv)) {
          const ref = tokenRef(value, appTokens);
          if (!ref) continue;
          if (ref.kind === 'github') envGrants.set(name, githubGrant);
          else {
            const permissions = appTokens.get(ref.id);
            envGrants.set(
              name,
              permissions
                ? grant(permissions, `app-token:${ref.id}`)
                : { kind: 'unscoped', label: `app-token:${ref.id}` }
            );
          }
        }
      };

      for (const step of steps) {
        if (!step || typeof step !== 'object') continue;
        /** @type {Map<string, TokenGrant>} */
        const envGrants = new Map();
        considerStepEnv(jobRecord.env, envGrants);
        considerStepEnv(step.env, envGrants);
        const withInputs = step.with ?? {};
        const scriptPieces = [];
        if (typeof step.run === 'string') {
          scriptPieces.push({
            text: step.run,
            shell: true,
            file: workflowPath,
          });
        }
        if (
          String(step.uses ?? '').includes('github-script') &&
          typeof withInputs.script === 'string'
        ) {
          scriptPieces.push({
            text: withInputs.script,
            shell: false,
            file: workflowPath,
          });
        }
        if (scriptPieces.length === 0) continue;

        const explicit =
          step.env?.GH_TOKEN ??
          step.env?.GITHUB_TOKEN ??
          withInputs['github-token'] ??
          withInputs.token;
        const explicitRef = explicit ? tokenRef(explicit, appTokens) : null;
        /** @type {TokenGrant} */
        let defaultGrant = githubGrant;
        if (explicitRef?.kind === 'app') {
          const permissions = appTokens.get(explicitRef.id);
          defaultGrant = permissions
            ? grant(permissions, `app-token:${explicitRef.id}`)
            : { kind: 'unscoped', label: `app-token:${explicitRef.id}` };
        } else if (explicitRef?.kind === 'github') {
          defaultGrant = githubGrant;
        }

        /**
         * @param {string} text
         * @param {string} file
         * @param {TokenGrant} token
         * @param {'js' | 'shell'} mode
         * @param {number} [lineOffset]
         */
        const record = (text, file, token, mode, lineOffset = 0) => {
          if (token.kind === 'unrestricted') return;
          if (token.kind === 'unscoped') {
            const key = `${workflowPath}:${jobId}:unscoped:${file}`;
            if (!seenGaps.has(key)) {
              seenGaps.add(key);
              gaps.push({
                workflow: workflowPath,
                job: jobId,
                call: 'unscoped-app-token',
                file,
                line: 1,
              });
            }
            return;
          }
          for (const found of extractCalls(text, mode)) {
            calls += 1;
            const localLine = lineOf(text, found.index);
            let line = lineOffset + localLine;
            if (file === workflowPath) {
              const probe = (text.split('\n')[localLine - 1] ?? '').trim();
              const at = probe.length >= 12 ? raw.indexOf(probe) : -1;
              if (at >= 0) line = lineOf(raw, at);
            }
            if (!found.requirement) {
              if (
                found.kind === 'graphql' ||
                found.kind === 'rest' ||
                found.kind === 'octokit' ||
                found.kind === 'cli'
              ) {
                // Mapped calls always carry a requirement. Unmapped writes are gaps.
              }
              const gapKey = `${workflowPath}:${jobId}:${found.call}`;
              if (!seenGaps.has(gapKey)) {
                seenGaps.add(gapKey);
                gaps.push({
                  workflow: workflowPath,
                  job: jobId,
                  call: found.call,
                  file,
                  line,
                });
              }
              continue;
            }
            const missing = missingPermissions(
              token.permissions,
              found.requirement
            );
            if (missing.length === 0) continue;
            const dedupe = `${workflowPath}:${jobId}:${found.call}:${missing.slice().sort().join(',')}:${token.label}`;
            if (seen.has(dedupe)) continue;
            seen.add(dedupe);
            const ack = matchAcknowledged(
              workflowPath,
              jobId,
              found.call,
              missing,
              acknowledged
            );
            if (ack) usedAcknowledgements.add(ack.id);
            const granted =
              token.permissions === 'read-all' ||
              token.permissions === 'write-all'
                ? token.permissions
                : Object.entries(token.permissions)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, level]) => `${name}:${level}`)
                    .join(', ');
            mismatches.push({
              workflow: workflowPath,
              job: jobId,
              call: found.call,
              missing,
              file,
              line,
              token: `${token.label} (${granted || 'none'})`,
              message: ack
                ? ack.message
                : `${workflowPath} job ${jobId} calls ${found.call} which needs ${missing.join(' and ')}, but ${token.label} has ${granted || 'no permissions'} (${file}:${line})`,
              acknowledged: Boolean(ack),
            });
          }
        };

        for (const piece of scriptPieces) {
          const pieceOffset = lineOffsetIn(raw, piece.text);
          if (!piece.shell) {
            record(piece.text, piece.file, defaultGrant, 'js', pieceOffset);
            continue;
          }
          const shell = maskComments(piece.text, 'shell');
          for (const command of splitShellCommands(shell)) {
            const override = ghTokenOverride(command);
            const token =
              override && envGrants.has(override)
                ? /** @type {TokenGrant} */ (envGrants.get(override))
                : defaultGrant;
            record(
              command,
              piece.file,
              token,
              'shell',
              lineOffsetIn(raw, command)
            );
            if (!/\b(?:node|bash|sh)\b/.test(command)) continue;
            const invocation = nodeInvocation(command);
            for (const script of scriptPathsIn(command)) {
              const abs = path.join(root, script);
              if (!existsSync(abs)) continue;
              const source = cache.get(abs) ?? readFileSync(abs, 'utf8');
              cache.set(abs, source);
              const scriptMode = script.endsWith('.sh') ? 'shell' : 'js';
              const scoped =
                scriptMode === 'js' && invocation?.script === script
                  ? sourceForSubcommand(source, invocation.subcommand)
                  : source;
              record(scoped, script, token, scriptMode);
            }
          }
        }
      }
    }
  }

  if (requireAcknowledged) {
    for (const item of acknowledged) {
      if (usedAcknowledgements.has(item.id)) continue;
      mismatches.push({
        workflow: item.workflow,
        job: item.job,
        call: 'acknowledged-exception',
        missing: item.missing,
        file: item.workflow,
        line: 1,
        token: '',
        message: `Acknowledged exception ${item.id} did not match a live ${item.call} mismatch in ${item.job}. Remove the exception after Tim approves the scope change.`,
        acknowledged: false,
      });
    }
  }

  const warnings = mismatches.filter(item => item.acknowledged);
  const failures = mismatches.filter(item => !item.acknowledged);
  return { calls, mismatches, gaps, warnings, failures };
}

/**
 * @param {ReturnType<typeof scanWorkflowTokenScopes>} result
 * @param {(line: string) => void} [log]
 * @returns {number}
 */
export function reportWorkflowTokenScopes(result, log = console.log) {
  for (const warning of result.warnings) {
    log(
      `::warning file=${warning.file},line=${warning.line},title=Token scope::${warning.message}`
    );
  }
  for (const failure of result.failures) {
    log(
      `::error file=${failure.file},line=${failure.line},title=Token scope::${failure.message}`
    );
  }
  log(
    `workflow-token-scope: ${result.calls} calls, ${result.warnings.length} acknowledged, ${result.failures.length} mismatches, ${result.gaps.length} unmapped`
  );
  return result.failures.length === 0 ? 0 : 1;
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root =
    rootFlag === -1
      ? process.cwd()
      : process.argv[rootFlag + 1] || process.cwd();
  const result = scanWorkflowTokenScopes(path.resolve(root));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  }
  process.exitCode = reportWorkflowTokenScopes(result, line => {
    console.error(line);
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
