// biome-ignore-all format: keep the gate detector within the diff budget
/**
 * JOV-INV-045. Fails a pull request that loosens a blocking gate.
 * Trusted-base copy. Override prints every finding:
 *   node scripts/invariants/gate-weakening-detector.mjs --check
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CONFIG_URL = new URL('./gate-weakening-detector.config.json', import.meta.url);
const SKIP_NAME = ['it', 'test', 'describe'].join('|');
const SUPPRESSIONS = [
  ['test-skip', new RegExp(`\\b(?:${SKIP_NAME})\\.skip\\b`)],
  ['test-only', new RegExp(`\\b(?:${SKIP_NAME})\\.only\\b`)],
  ['xit', new RegExp(`\\bx(?:${SKIP_NAME})\\b`)],
  ['eslint-disable', new RegExp(String.raw`\beslint-disable\b`)],
  ['ts-ignore', new RegExp(String.raw`@ts-ignore\b`)],
  ['ts-expect-error', new RegExp(String.raw`@ts-expect-error\b(?!\s+\S)`)],
  ['biome-ignore', new RegExp(String.raw`\bbiome-ignore\b`)],
];
const CI_BUDGETS = [
  ['timeout-minutes', 'timeout-raised'],
  ['timeout_minutes', 'timeout-raised'],
  ['retries', 'retries-raised'],
  ['retry', 'retries-raised'],
];
const CONTINUE_ON_ERROR = /continue-on-error:\s*['"]?(?:true|\$\{\{\s*true\s*\}\})['"]?/;
const IF_FALSE = /^\s*if:\s*(?:\$\{\{\s*)?false\s*(?:\}\})?\s*(?:#.*)?$/;
const ADVISORY = new RegExp('(?:^|\\s)(?:advisory:\\s*true|blocking:\\s*false|' + 'enforcement:\\s*[\'"]?advisory[\'"]?)');
const NUMBER_SOURCE = /['"]?([A-Za-z][\w.-]*)['"]?\s*[:=]\s*(-?\d+(?:\.\d+)?)\b/;
const finding = (kind, path, detail) => ({ kind, path, detail });
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const textOf = value => value || '';
const linesOf = value => textOf(value).split('\n');
export function loadConfig(url = CONFIG_URL) {
  return JSON.parse(readFileSync(url, 'utf8'));
}
export function evaluateGateWeakening(files, config = loadConfig()) {
  const findings = [];
  for (const file of files ?? []) {
    if (!file?.path || excluded(file.path, config)) continue;
    findings.push(...inspectInvariantTest(file));
    if (isSelf(file.path, config)) {
      findings.push(...inspectSelf(file));
      continue;
    }
    findings.push(...inspectGateFile(file, config));
  }
  return dedupe(findings);
}
export function decide(findings, override = {}, config = loadConfig()) {
  const label = config.override.label;
  const reason = markerReason(override.body ?? '', config);
  const hasLabel = labelNames(override.labels).includes(label);
  if (findings.length === 0) {
    return { ok: true, mode: 'pass', findings, reason: '', hasLabel, label };
  }
  const ok = Boolean(reason && hasLabel);
  return {
    ok,
    mode: ok ? 'override' : 'fail',
    findings,
    reason,
    hasLabel,
    label,
  };
}
export function formatReport(decision) {
  if (decision.mode === 'skip') {
    return 'gate-weakening-detector: skipped (pull_request only)\n';
  }
  if (decision.mode === 'pass') {
    return `gate-weakening-detector: PASS ${decision.files ?? 0} files\n`;
  }
  const lines = [decision.mode === 'override' ? 'gate-weakening-detector: OVERRIDE' : 'gate-weakening-detector: FAIL'];
  if (decision.mode === 'override') {
    lines.push(`gate-change: ${decision.reason}`, `label: ${decision.label}`);
  } else if (decision.mode === 'unreadable') {
    lines.push(`diff-unreadable: ${decision.detail}`);
  }
  for (const item of decision.findings ?? []) {
    lines.push(`${item.kind} ${item.path} ${item.detail}`);
  }
  if (decision.mode === 'fail') {
    const missing = [];
    if (!decision.reason) missing.push('PR body line "gate-change: <reason>"');
    if (!decision.hasLabel) missing.push(`label "${decision.label}"`);
    if (missing.length) lines.push(`override missing ${missing.join(' and ')}`);
  }
  return `${lines.join('\n')}\n`;
}
export function overrideFromEvent(event) {
  const pullRequest = event?.pull_request;
  return {
    body: typeof pullRequest?.body === 'string' ? pullRequest.body : '',
    labels: labelNames(pullRequest?.labels),
  };
}
/** @param {string[]} [argv] @param {NodeJS.ProcessEnv} [env] @param {{ stdout: { write: (chunk: string) => void }, cwd: string }} [io] */
export function main(argv = [], env = process.env, io = defaultIo()) {
  if ((env.GITHUB_EVENT_NAME || '') !== 'pull_request' && !argv.includes('--check')) {
    io.stdout.write(formatReport({ mode: 'skip' }));
    return 0;
  }
  try {
    const config = loadConfig();
    const files = loadDiffFiles(io.cwd, resolveBaseRef(io.cwd, env));
    const decision = decide(evaluateGateWeakening(files, config), overrideFrom(argv, env), config);
    io.stdout.write(formatReport({ ...decision, files: files.length }));
    return decision.ok ? 0 : 1;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    io.stdout.write(formatReport({ mode: 'unreadable', detail, findings: [] }));
    return 1;
  }
}
export function resolveBaseRef(cwd, env) {
  if (env.GATE_WEAKENING_BASE && verifyRef(cwd, env.GATE_WEAKENING_BASE)) {
    return env.GATE_WEAKENING_BASE;
  }
  const base = env.GITHUB_BASE_REF || 'main';
  for (const ref of [`origin/${base}`, base, env.TURBO_SCM_BASE || '']) {
    if (ref && verifyRef(cwd, ref)) return ref;
  }
  throw new Error(`base ref origin/${base} is not available`);
}
export function loadDiffFiles(cwd, baseRef) {
  // The base tip includes commits that landed after this pull request branched.
  // Those files are absent from an older head; they are not deletions. The
  // pre-image is that same merge base, so a later tightening on main is not
  // judged as this pull request loosening the gate.
  const merged = git(cwd, ['merge-base', baseRef, 'HEAD']);
  if (merged.code !== 0) throw new Error(merged.stderr.trim() || 'git merge-base failed');
  const mergeBase = merged.stdout.trim();
  const listed = git(cwd, ['diff', '--name-status', '--find-renames', mergeBase, 'HEAD']);
  if (listed.code !== 0) throw new Error(listed.stderr.trim() || 'git diff failed');
  const files = [];
  for (const line of listed.stdout.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    const flag = parts[0] || '';
    const path = parts.at(-1) || '';
    const renamed = flag.startsWith('R') || flag.startsWith('C');
    files.push({
      path,
      before: flag.startsWith('A') ? null : showFile(cwd, mergeBase, renamed ? parts[1] : path),
      after: flag.startsWith('D') ? null : showFile(cwd, 'HEAD', path),
    });
  }
  return files;
}
function inspectGateFile(file, config) {
  const findings = [];
  const add = (kind, detail) => findings.push(finding(kind, file.path, detail));
  const added = addedLines(file.before, file.after);
  if (isRuleset(file.path)) findings.push(...rulesetFindings(file));
  if (file.path === config.prReadyPath) {
    for (const name of removedNeeds(file, config.prReadyJob)) {
      add('pr-ready-check-removed', name);
    }
  }
  if (file.path === config.sourceValidationPath) {
    for (const name of removedNames(stepNames(file.before), stepNames(file.after))) {
      add('source-validation-check-removed', name);
    }
  }
  if (file.path === config.sourceGuardPath) {
    for (const name of removedNames(guardIds(file.before), guardIds(file.after))) {
      add('source-guard-removed', name);
    }
  }
  if (isCiYaml(file.path)) {
    for (const line of added) {
      if (/^\s*#/.test(line)) continue;
      const trimmed = line.trim();
      if (CONTINUE_ON_ERROR.test(line)) add('continue-on-error', trimmed);
      if (IF_FALSE.test(line)) add('if-false', trimmed);
      if (ADVISORY.test(line)) add('advisory', trimmed);
    }
    for (const [key, kind] of CI_BUDGETS) {
      if (raised(file.before, file.after, key)) add(kind, key);
    }
  }
  if (isShrinkOnly(file.path) && file.after != null && grew(file.before ?? '', file.after)) {
    add('shrink-only-growth', 'count increased');
  }
  if (isThresholdPath(file.path) && file.before != null && file.after != null) {
    findings.push(...thresholdFindings(file, config));
  }
  if (isCode(file.path)) {
    for (const line of added) {
      for (const [kind, pattern] of SUPPRESSIONS) {
        if (pattern instanceof RegExp && pattern.test(line)) add(kind, line.trim());
      }
    }
  }
  findings.push(...ignoreFindings(file));
  return findings;
}
function inspectInvariantTest(file) {
  if (!/^scripts\/invariants\/.*\.test\.(?:mjs|ts)$/.test(file.path)) return [];
  if (file.before == null) return [];
  if (file.after == null) return [finding('invariant-test-deleted', file.path, 'file deleted')];
  if (hasTest(file.before) && !hasTest(file.after)) {
    return [finding('invariant-test-emptied', file.path, 'no tests remain')];
  }
  return [];
}
function inspectSelf(file) {
  if (file.path.endsWith('gate-weakening-detector.mjs')) {
    return file.before != null && file.after == null ? [finding('detector-deleted', file.path, 'script removed')] : [];
  }
  if (!file.path.endsWith('gate-weakening-detector.config.json') || file.before == null) {
    return [];
  }
  if (file.after == null) {
    return [finding('detector-config-deleted', file.path, 'config removed')];
  }
  let before;
  let after;
  try {
    before = JSON.parse(file.before);
    after = JSON.parse(file.after);
  } catch {
    return [finding('detector-config-deleted', file.path, 'config unreadable')];
  }
  const findings = [];
  const add = (kind, detail) => findings.push(finding(kind, file.path, detail));
  if (before.schema !== after.schema || before.invariantId !== after.invariantId) {
    add('detector-rule-removed', 'identity');
  }
  for (const kind of before.requiredKinds ?? []) {
    if (!(after.requiredKinds ?? []).includes(kind)) add('detector-rule-removed', kind);
  }
  for (const exclusion of after.scanExclusions ?? []) {
    if (!(before.scanExclusions ?? []).includes(exclusion)) {
      add('scan-exclusion-grew', exclusion);
    }
  }
  if (before.override?.label !== after.override?.label || before.override?.bodyLine !== after.override?.bodyLine) add('override-policy-changed', 'override');
  return findings;
}
function rulesetFindings(file) {
  const findings = [];
  const add = (kind, detail) => findings.push(finding(kind, file.path, detail));
  if (lost(file, /enforcement:\s*['"]?active['"]?/) && gained(file, /enforcement:\s*['"]?(?:disabled|evaluate|off)['"]?/)) add('ruleset-enforcement-loosened', 'enforcement');
  if (lost(file, /strict:\s*true\b/) && gained(file, /strict:\s*false\b/)) {
    add('branch-strict-loosened', 'strict');
  }
  const beforeCount = reviewCount(file.before);
  const afterCount = reviewCount(file.after);
  if (beforeCount !== null && afterCount !== null && afterCount < beforeCount) {
    add('required-reviews-loosened', `${beforeCount} -> ${afterCount}`);
  }
  if (/required_status_checks/.test(`${textOf(file.before)}\n${textOf(file.after)}`)) {
    for (const name of removedNames(quotedItems(file.before), quotedItems(file.after))) {
      add('required-check-removed', name);
    }
  }
  return findings;
}
function thresholdFindings(file, config) {
  const before = numbersByKey(file.before, null);
  const after = numbersByKey(file.after, null);
  const findings = [];
  for (const key of new Set([...before.keys(), ...after.keys()])) {
    const direction = thresholdDirection(key, file.path, config);
    if (!direction) continue;
    if (loosenedNumbers(before.get(key) ?? [], after.get(key) ?? [], direction)) {
      findings.push(finding('threshold-loosened', file.path, key));
    }
  }
  return findings;
}
function ignoreFindings(file) {
  if (isLineIgnore(file.path)) {
    const previous = new Set(meaningful(file.before));
    return meaningful(file.after)
      .filter(line => !previous.has(line))
      .map(line => finding('ignore-list-entry', file.path, line));
  }
  if (!/(^|\/)(biome\.json|knip\.json|eslint\.config\.[cm]?js)$/.test(file.path)) return [];
  try {
    const previous = [];
    const next = [];
    collectIgnore(JSON.parse(file.before || '{}'), '', previous);
    collectIgnore(JSON.parse(file.after || '{}'), '', next);
    const seen = new Set(previous);
    return next.filter(entry => !seen.has(entry)).map(entry => finding('ignore-list-entry', file.path, entry));
  } catch {
    return [];
  }
}
function thresholdDirection(key, path, config) {
  if (/budget/i.test(path)) return 'higher';
  const lower = config.lowerIsLooser.some(token => keyMatches(key, token));
  const higher = config.higherIsLooser.some(token => keyMatches(key, token));
  if (lower && !higher) return 'lower';
  if (higher && !lower) return 'higher';
  return null;
}
const normalizeKey = value => value.toLowerCase().replace(/_/g, '-');
function keyMatches(key, token) {
  const value = normalizeKey(key);
  const needle = normalizeKey(token);
  return value === needle || value.endsWith(`-${needle}`);
}
function grew(before, after) {
  try {
    return structureGrew(JSON.parse(before), JSON.parse(after));
  } catch {
    return meaningful(after).length > meaningful(before).length;
  }
}
function structureGrew(before, after) {
  if (typeof before === 'number' && typeof after === 'number') return after > before;
  if (Array.isArray(before) && Array.isArray(after)) return after.length > before.length;
  if (!isRecord(before) || !isRecord(after)) return false;
  return Object.keys(after).some(key => (key in before ? structureGrew(before[key], after[key]) : growthSeed(after[key])));
}
function growthSeed(value) {
  if (typeof value === 'number' || (Array.isArray(value) && value.length > 0)) return true;
  return isRecord(value) && Object.values(value).some(growthSeed);
}
function loosenedNumbers(beforeValues, afterValues, direction) {
  const dropped = unmatched(beforeValues, afterValues).sort((left, right) => left - right);
  const novel = unmatched(afterValues, beforeValues).sort((left, right) => left - right);
  return dropped.slice(0, novel.length).some((value, index) => (direction === 'lower' ? novel[index] < value : novel[index] > value));
}
function unmatched(source, other) {
  const pool = [...other];
  return source.filter(value => {
    const index = pool.indexOf(value);
    if (index < 0) return true;
    pool.splice(index, 1);
    return false;
  });
}
function raised(before, after, key) {
  const only = new Set([key]);
  return loosenedNumbers(numbersByKey(before, only).get(key) ?? [], numbersByKey(after, only).get(key) ?? [], 'higher');
}
function numbersByKey(text, keys) {
  const map = new Map();
  const pattern = new RegExp(NUMBER_SOURCE.source, 'g');
  for (const match of textOf(text).matchAll(pattern)) {
    if (keys && !keys.has(match[1])) continue;
    const list = map.get(match[1]) ?? [];
    list.push(Number(match[2]));
    map.set(match[1], list);
  }
  return map;
}
function removedNeeds(file, job) {
  const previous = needsIn(jobBlock(file.before, job));
  if (!previous?.length) return [];
  return removedNames(previous, needsIn(jobBlock(file.after, job)) ?? []);
}
function jobBlock(text, job) {
  if (!text) return null;
  const start = text.search(new RegExp(`^  ${job}:[ \\t]*$`, 'm'));
  if (start < 0) return null;
  const rest = text.slice(start);
  const next = rest.slice(1).search(/^  [\w-]+:[ \t]*$/m);
  return next < 0 ? rest : rest.slice(0, next + 1);
}
function needsIn(block) {
  if (!block) return null;
  const bracket = block.match(/^\s*needs:\s*\[([\s\S]*?)\]/m);
  if (bracket) {
    return bracket[1]
      .split(',')
      .map(item => item.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }
  const sequence = block.match(/^\s*needs:\s*\n((?:[ \t]+-[ \t]+\S.*\n?)*)/m);
  if (!sequence) return [];
  return [...sequence[1].matchAll(/^[ \t]+-[ \t]+['"]?([^'"\s#]+)/gm)].map(match => match[1]);
}
const stepNames = text => [...textOf(text).matchAll(/^[\s-]*- name:\s*(.+)$/gm)].map(match => match[1].trim().replace(/^['"]|['"]$/g, ''));
function guardIds(text) {
  const start = textOf(text).indexOf('export const SOURCE_GUARDS');
  const end = textOf(text).indexOf('export function selectSourceGuards');
  if (start < 0 || end < start) return [];
  return [
    ...textOf(text)
      .slice(start, end)
      .matchAll(/id:\s*['"]([^'"]+)['"]/g),
  ].map(match => match[1]);
}
const quotedItems = text => [...textOf(text).matchAll(/^\s*-\s+['"]([^'"]+)['"]/gm)].map(match => match[1]);
const removedNames = (before, after) => before.filter(name => !new Set(after).has(name));
const reviewCount = text => {
  const match = textOf(text).match(/required_approving_review_count:\s*(\d+)/);
  return match ? Number(match[1]) : null;
};
const hasPattern = (text, pattern) => linesOf(text).some(line => pattern.test(line));
const lost = (file, pattern) => hasPattern(file.before, pattern) && !hasPattern(file.after, pattern);
const gained = (file, pattern) => hasPattern(file.after, pattern) && !hasPattern(file.before, pattern);
const hasTest = text => new RegExp(`\\b(?:${SKIP_NAME})(?:\\.(?:skip|only))?\\s*\\(`).test(textOf(text));
function addedLines(before, after) {
  const counts = new Map();
  for (const line of linesOf(before)) counts.set(line, (counts.get(line) || 0) + 1);
  const added = [];
  for (const line of linesOf(after)) {
    const remaining = counts.get(line) || 0;
    if (remaining > 0) counts.set(line, remaining - 1);
    else added.push(line);
  }
  return added;
}
const meaningful = text =>
  linesOf(text)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
function collectIgnore(value, key, out) {
  if (Array.isArray(value)) {
    if (/ignore|exclude/i.test(key)) {
      for (const item of value) if (typeof item === 'string') out.push(item);
    }
    return;
  }
  if (!isRecord(value)) return;
  for (const [childKey, child] of Object.entries(value)) collectIgnore(child, childKey, out);
}
const markerReason = (body, config) => body.match(new RegExp(config.override.bodyLine, 'm'))?.[1]?.trim() ?? '';
function labelNames(labels) {
  if (!Array.isArray(labels)) return [];
  return labels.map(label => (typeof label === 'string' ? label : label?.name)).filter(name => typeof name === 'string' && name);
}
const excluded = (path, config) => (config.scanExclusions ?? []).some(prefix => path.startsWith(prefix));
const isSelf = (path, config) => (config.selfPaths ?? []).includes(path);
const isRuleset = path => /ruleset|branch-protection|branch_protection/i.test(path);
const isCiYaml = path => /^(\.github\/|github\/rulesets\/|scripts\/ci-|scripts\/lib\/ci-)/.test(path) && /\.(?:yml|yaml|mjs|js)$/.test(path);
const isShrinkOnly = path => {
  const name = path.split('/').pop() || '';
  return !/\.test\./.test(name) && /(baseline|allowlist|ignore)/i.test(name) && (path.startsWith('scripts/') || /\.baseline\.json$/i.test(name));
};
const isThresholdPath = path => /budget|coverage|lighthouse|a11y|codecov|performance/i.test(path);
const isCode = path => /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts|yml|yaml|json)$/i.test(path);
const isLineIgnore = path => /(^|\/)\.(?:eslint|biome)ignore$/.test(path);
function dedupe(findings) {
  const seen = new Set();
  return findings
    .filter(item => {
      const key = `${item.kind}\0${item.path}\0${item.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => `${left.kind}\0${left.path}\0${left.detail}`.localeCompare(`${right.kind}\0${right.path}\0${right.detail}`));
}
function overrideFrom(argv, env) {
  const bodyFlag = flag(argv, '--body');
  const labels = flags(argv, '--label');
  if (bodyFlag !== null || labels.length > 0) return { body: bodyFlag ?? '', labels };
  if (!env.GITHUB_EVENT_PATH) return { body: '', labels: [] };
  try {
    return overrideFromEvent(JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8')));
  } catch {
    throw new Error('GITHUB_EVENT_PATH is unreadable');
  }
}
const flag = (argv, name) => {
  const index = argv.indexOf(name);
  return index < 0 ? null : (argv[index + 1] ?? '');
};
function flags(argv, name) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name && argv[index + 1]) values.push(argv[index + 1]);
  }
  return values;
}
const verifyRef = (cwd, ref) => git(cwd, ['rev-parse', '--verify', '--quiet', ref]).code === 0;
function showFile(cwd, ref, path) {
  const shown = git(cwd, ['show', `${ref}:${path}`]);
  if (shown.code !== 0) throw new Error(`cannot read ${ref}:${path}`);
  return shown.stdout;
}
function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    code: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}
const defaultIo = () => ({ stdout: process.stdout, cwd: process.cwd() });
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), process.env, defaultIo());
}
