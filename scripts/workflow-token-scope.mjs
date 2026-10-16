#!/usr/bin/env node
/**
 * Static check: a job that mints a GitHub token must grant every scope its
 * scripts' enqueuePullRequest calls require.
 *
 * Tokens come from actions/create-github-app-token `permission-*` inputs or
 * from the job `permissions:` block (workflow-level permissions apply when
 * the job does not set its own). Calls are taken from the step's `run` /
 * github-script body and from the local scripts that step executes.
 * enqueuePullRequest counts inside a string literal, or as `gh pr merge --auto`.
 *
 * The rearm job in merge-queue-green-enroll.yml is an acknowledged exception:
 * it prints a warning and does not fail the run. Every other enqueue mismatch
 * fails. Removing the live mismatch without removing the exception also fails.
 *
 * REST writes, Octokit writes, and the other GraphQL mutations are a separate
 * catalog. They are not enforced here.
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

/** The mutation this layer enforces. Further mutations register by extending this map. */
export const GRAPHQL_MUTATIONS = {
  enqueuePullRequest: { all: { contents: 'write' } },
};

/**
 * Pre-existing rearm failure (run 38960318802, job 117173542106).
 * Scope changes are Tim-only; this check must not edit the token.
 * @type {Array<{ id: string, workflow: string, job: string, call: string, missing: string[], message: string }>}
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
];

const SCRIPT_PATH =
  /(?:^|[\s'"`=(])(\.?\/?(?:[A-Za-z0-9_.-]+\/)*?(?:scripts|\.github\/scripts)\/[A-Za-z0-9_./-]+\.(?:mjs|js|cjs|sh))(?=$|[\s'"`);,&|])/g;

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
 * GraphQL mutations count only inside string literals, so a JS call such as
 * `io.dequeuePullRequest(id)` is not treated as the GraphQL field.
 * @param {string} source
 * @param {FoundCall[]} calls
 */
function pushGraphqlStrings(source, calls) {
  const field = new RegExp(
    `\\b(${Object.keys(GRAPHQL_MUTATIONS).join('|')})\\s*\\(`,
    'g'
  );
  forEachJsString(source, (text, index) => {
    for (const match of text.matchAll(field)) {
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
  });
}

/**
 * `gh pr merge --auto` is how this repo fulfills enqueuePullRequest.
 * `--disable-auto` is a different mutation and is not this call.
 * @param {string} command
 */
function shellEnqueues(command) {
  if (!/\bgh\s+pr\s+merge\b/.test(command)) return false;
  if (/--(?:disable-auto|undo)\b/.test(command)) return false;
  return /(?:^|\s)--auto(?:\s|=|$)/.test(command);
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
  if (mode !== 'shell') return calls;
  for (const command of splitShellCommands(masked)) {
    if (!shellEnqueues(command)) continue;
    const at = masked.indexOf(command);
    calls.push({
      call: 'enqueuePullRequest',
      index: at < 0 ? 0 : at,
      kind: 'cli',
      requirement: GRAPHQL_MUTATIONS.enqueuePullRequest,
    });
  }
  return calls;
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
            for (const script of scriptPathsIn(command)) {
              const abs = path.join(root, script);
              if (!existsSync(abs)) continue;
              const source = cache.get(abs) ?? readFileSync(abs, 'utf8');
              cache.set(abs, source);
              const scriptMode = script.endsWith('.sh') ? 'shell' : 'js';
              record(source, script, token, scriptMode);
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
