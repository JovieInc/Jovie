#!/usr/bin/env node
/**
 * Outcome coverage guard (JOV-14474).
 *
 * Every chat tool and every core-surface mutation must belong to one action in
 * docs/product/outcome-coverage.json, and every action names the outcome check
 * that proves it: a test that performs it as a test account and asserts the
 * real result exists. Actions without one sit on a gap list that can only
 * shrink. Unit tests that mock the tool, or specs that assert a reply appeared,
 * do not count: that is how "make merch" passed CI while making nothing.
 *
 * Fails when:
 * - a chat tool in CHAT_ROUTE_TOOL_IDS is unmapped, or mapped twice;
 * - a non-deferred mutation in the launch inventory is unmapped;
 * - an entry point, check file or check test title does not exist;
 * - an action has no check and no gap reason, or both;
 * - against the merge base: a new action, tool or entry point lands on an
 *   action with no check, or the gap list grows.
 *
 * Usage: node scripts/outcome-coverage.mjs [--check] [--json] [--base <ref>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REGISTRY_PATH = 'docs/product/outcome-coverage.json';
export const INVENTORY_PATH =
  'docs/product/generated/artist-launch-inventory.json';
export const CHAT_TOOLS_PATH = 'apps/web/lib/chat/chat-tool-inventory.ts';
export const SCHEMA = 'jovie.outcome-coverage/v1';
export const RUN_KINDS = Object.freeze([
  'pr',
  'merge',
  'nightly',
  'prod-postdeploy',
]);
const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const HTTP_METHODS = new Set([
  'GET',
  'HEAD',
  'OPTIONS',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
]);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} source */
export function parseChatToolIds(source) {
  const block = /CHAT_ROUTE_TOOL_IDS\s*=\s*\[([\s\S]*?)\]\s*as const/u.exec(
    source
  );
  if (!block)
    throw new Error(`CHAT_ROUTE_TOOL_IDS not found in ${CHAT_TOOLS_PATH}`);
  return [...block[1].matchAll(/['"]([A-Za-z0-9_]+)['"]/gu)].map(m => m[1]);
}

/**
 * Entry points the launch inventory marks as a core surface that can change
 * state: non-deferred handlers with a write method, and non-deferred actions.
 * @param {{ inventory: Array<{ source: string, kind: string, surface: string, methods?: string[], export?: string }> }} inventory
 */
export function requiredEntryPoints(inventory) {
  const required = [];
  for (const record of inventory.inventory) {
    if (record.surface === 'deferred') continue;
    if (record.kind === 'handler') {
      for (const method of record.methods ?? []) {
        if (!READ_ONLY_METHODS.has(method))
          required.push(`${record.source}#${method}`);
      }
    } else if (record.kind === 'action' && record.export) {
      required.push(`${record.source}#${record.export}`);
    }
  }
  return required.sort();
}

/** @param {string} source @param {string} name */
export function hasExport(source, name) {
  const escaped = name.replace(/[$]/gu, '\\$');
  return new RegExp(
    `export\\s+(?:async\\s+)?(?:function\\s*\\*?\\s*|const\\s+|let\\s+)${escaped}\\b|export\\s*\\{[^}]*\\b(?:as\\s+)?${escaped}\\b[^}]*\\}`,
    'u'
  ).test(source);
}

/** @param {{ checks?: unknown[] }} action */
const isGap = action => !action.checks?.length;

/**
 * @typedef {{ file: string, test: string, runs: string }} OutcomeCheck
 * @typedef {{ id: string, label?: string, core?: boolean, entryPoints?: string[], chatTools?: string[], checks?: OutcomeCheck[], gap?: string, note?: string }} OutcomeAction
 * @typedef {{ schema?: string, actions: OutcomeAction[] }} OutcomeRegistry
 */

/**
 * @param {OutcomeRegistry} registry
 * @param {{ chatTools: string[], required: string[], readFile: (file: string) => string | null }} context
 */
export function validateRegistry(registry, context) {
  const errors = [];
  if (registry.schema !== SCHEMA)
    errors.push(`schema must be ${SCHEMA}, got ${registry.schema}`);
  if (!Array.isArray(registry.actions)) {
    errors.push('actions must be an array');
    return errors;
  }
  const ids = new Set();
  const toolOwner = new Map();
  const entryOwner = new Map();
  for (const action of registry.actions) {
    const where = `action ${action.id ?? '(no id)'}`;
    if (!action.id || !/^[a-z0-9-]+$/u.test(action.id))
      errors.push(`${where}: id must be kebab-case`);
    if (ids.has(action.id)) errors.push(`${where}: duplicate id`);
    ids.add(action.id);
    for (const tool of action.chatTools ?? []) {
      if (toolOwner.has(tool))
        errors.push(
          `chat tool ${tool} is mapped twice (${toolOwner.get(tool)}, ${action.id})`
        );
      toolOwner.set(tool, action.id);
    }
    for (const entry of action.entryPoints ?? []) {
      if (entryOwner.has(entry))
        errors.push(
          `entry point ${entry} is mapped twice (${entryOwner.get(entry)}, ${action.id})`
        );
      entryOwner.set(entry, action.id);
      const [file, name] = entry.split('#');
      const source = file ? context.readFile(file) : null;
      if (!name)
        errors.push(`${where}: entry point ${entry} needs file#export`);
      else if (source === null)
        errors.push(`${where}: entry point file ${file} does not exist`);
      else if (!hasExport(source, name))
        errors.push(
          `${where}: ${file} has no export ${name}${HTTP_METHODS.has(name) ? ' handler' : ''}`
        );
    }
    const checks = action.checks ?? [];
    for (const check of checks) {
      if (!RUN_KINDS.includes(check.runs))
        errors.push(
          `${where}: check runs "${check.runs}" must be one of ${RUN_KINDS.join(', ')}`
        );
      const source = check.file ? context.readFile(check.file) : null;
      if (source === null)
        errors.push(`${where}: check file ${check.file} does not exist`);
      else if (!check.test || !source.includes(check.test))
        errors.push(
          `${where}: check test "${check.test}" is not in ${check.file}`
        );
    }
    if (!checks.length && !action.gap)
      errors.push(
        `${where}: has no outcome check, so it needs a gap reason (or add the check)`
      );
    if (checks.length && action.gap)
      errors.push(`${where}: has a check, so drop its gap reason`);
  }
  for (const tool of context.chatTools) {
    if (!toolOwner.has(tool))
      errors.push(
        `chat tool ${tool} has no action in ${REGISTRY_PATH}: add it to one with an outcome check`
      );
  }
  const known = new Set(context.chatTools);
  for (const [tool, owner] of toolOwner) {
    if (!known.has(tool))
      errors.push(
        `action ${owner}: chat tool ${tool} is not in CHAT_ROUTE_TOOL_IDS`
      );
  }
  for (const entry of context.required) {
    if (!entryOwner.has(entry))
      errors.push(
        `core mutation ${entry} has no action in ${REGISTRY_PATH}: add it to one with an outcome check`
      );
  }
  return errors;
}

/**
 * The ratchet: compared with the merge base, nothing new may land without a
 * check, and the gap list may not grow.
 * @param {OutcomeRegistry | null} base
 * @param {OutcomeRegistry} head
 */
export function compareWithBase(base, head) {
  if (!base) return [];
  const errors = [];
  const baseIds = new Set(base.actions.map(action => action.id));
  const baseTools = new Set(base.actions.flatMap(a => a.chatTools ?? []));
  const baseEntries = new Set(base.actions.flatMap(a => a.entryPoints ?? []));
  for (const action of head.actions) {
    if (!isGap(action)) continue;
    if (!baseIds.has(action.id))
      errors.push(
        `new action ${action.id} has no outcome check: new actions ship with one`
      );
    for (const tool of action.chatTools ?? []) {
      if (!baseTools.has(tool))
        errors.push(
          `new chat tool ${tool} sits on ${action.id}, which has no outcome check: add the check in this PR`
        );
    }
    for (const entry of action.entryPoints ?? []) {
      if (!baseEntries.has(entry))
        errors.push(
          `new entry point ${entry} sits on ${action.id}, which has no outcome check: add the check in this PR`
        );
    }
  }
  const baseGaps = base.actions.filter(isGap).length;
  const headGaps = head.actions.filter(isGap).length;
  if (headGaps > baseGaps)
    errors.push(
      `gap list grew from ${baseGaps} to ${headGaps}: it can only shrink`
    );
  return errors;
}

/** @param {OutcomeRegistry} registry */
export function summarize(registry) {
  const actions = registry.actions;
  const gaps = actions.filter(isGap);
  const tools = actions.flatMap(a => a.chatTools ?? []);
  const checkedTools = actions
    .filter(a => !isGap(a))
    .flatMap(a => a.chatTools ?? []);
  return {
    actions: actions.length,
    covered: actions.length - gaps.length,
    gaps: gaps.length,
    coreGaps: gaps.filter(a => a.core).map(a => a.id),
    chatTools: tools.length,
    chatToolsChecked: checkedTools.length,
  };
}

/**
 * Files changed on this branch that belong to an action with no check. Only a
 * warning until the core gaps have checks.
 * @param {OutcomeRegistry} registry
 * @param {string[]} changed
 */
export function gapTouches(registry, changed) {
  const touched = new Set(changed);
  const warnings = [];
  for (const action of registry.actions) {
    if (!isGap(action)) continue;
    const files = new Set(
      (action.entryPoints ?? []).map(entry => entry.split('#')[0])
    );
    for (const file of files) {
      if (touched.has(file))
        warnings.push(
          `${file} changed, and ${action.id} still has no outcome check (${action.gap})`
        );
    }
  }
  return warnings;
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * The merge base when history allows; on a shallow checkout, the base branch
 * tip (the ratchet still works, the changed-file warnings are skipped).
 * @param {string | undefined} explicit
 */
function resolveBase(explicit) {
  const ref =
    explicit ??
    process.env.OUTCOME_COVERAGE_BASE ??
    `origin/${process.env.GITHUB_BASE_REF || 'main'}`;
  const mergeBase = git(['merge-base', ref, 'HEAD']);
  if (mergeBase) return { sha: mergeBase, mergeBase: true };
  const tip = git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  return tip ? { sha: tip, mergeBase: false } : null;
}

function readAtBase(base, file) {
  if (!base) return null;
  const text = git(['show', `${base.sha}:${file}`]);
  return text ? JSON.parse(text) : null;
}

/** @param {string} file */
function readRepoFile(file) {
  const full = path.join(ROOT, file);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

export function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const baseIndex = argv.indexOf('--base');
  const baseRef = baseIndex >= 0 ? argv[baseIndex + 1] : undefined;
  const registry = JSON.parse(readRepoFile(REGISTRY_PATH) ?? 'null');
  if (!registry) {
    console.error(`outcome-coverage: ${REGISTRY_PATH} is missing`);
    return 1;
  }
  const context = {
    chatTools: parseChatToolIds(readRepoFile(CHAT_TOOLS_PATH) ?? ''),
    required: requiredEntryPoints(
      JSON.parse(readRepoFile(INVENTORY_PATH) ?? '{"inventory":[]}')
    ),
    readFile: readRepoFile,
  };
  const base = resolveBase(baseRef);
  const errors = [
    ...validateRegistry(registry, context),
    ...compareWithBase(readAtBase(base, REGISTRY_PATH), registry),
  ];
  const changed = base?.mergeBase
    ? (git(['diff', '--name-only', `${base.sha}...HEAD`]) ?? '')
        .split('\n')
        .filter(Boolean)
    : [];
  const warnings = gapTouches(registry, changed);
  const summary = summarize(registry);
  if (json) {
    console.log(JSON.stringify({ summary, errors, warnings }, null, 2));
  } else {
    for (const warning of warnings) console.warn(`warning: ${warning}`);
    for (const error of errors) console.error(`error: ${error}`);
    console.log(
      `outcome-coverage: ${summary.covered} of ${summary.actions} actions have an outcome check; ${summary.chatToolsChecked} of ${summary.chatTools} chat tools; core gaps: ${summary.coreGaps.join(', ') || 'none'}${base ? '' : ' (no merge base, ratchet skipped)'}`
    );
  }
  return errors.length ? 1 : 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
