#!/usr/bin/env node
/**
 * Review-findings lint (founder directive 2026-11-19, 'reviews raise the
 * baseline'): deterministic encoding of design/code review findings.
 *
 * Inputs (both under apps/web/review-findings/):
 *   findings.jsonl     append-only ledger; one JSON object per line.
 *   banned-values.json rules grown ONLY from encoded ledger findings.
 *
 * Behavior:
 *   - Ledger and rules integrity are always validated (exit 2 when either is
 *     malformed — a bad append must fail loudly even in informational mode).
 *   - Default mode is INFORMATIONAL: prints rule hits and token-bypass counts
 *     and exits 0. This check is non-required until promoted.
 *   - --strict exits 1 on any rule hit. That is the promotion target once the
 *     repeat-finding bar in review-findings/README.md is met.
 *   - --json emits machine-readable output.
 *
 * Dependency-free on purpose (plain node, no install step) so it can run in
 * any CI job. Scan scope and exclusions mirror the design-system count
 * ratchets: apps/web/{components,app} .ts/.tsx, excluding *.test.* and
 * __tests__ (stories are scanned, matching the raw-button ratchet).
 *
 * CLI:
 *   node scripts/lint-review-findings.mjs [--strict] [--json]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..');
const FINDINGS_DIR = join(WEB_ROOT, 'review-findings');
const LEDGER_PATH = join(FINDINGS_DIR, 'findings.jsonl');
const RULES_PATH = join(FINDINGS_DIR, 'banned-values.json');
const SCAN_ROOTS = ['components', 'app'].map(dir => join(WEB_ROOT, dir));

const LAYERS = /** @type {const} */ ([
  'token',
  'component',
  'lint',
  'visual',
  'env',
  'doc',
]);
const RULE_STATUSES = /** @type {const} */ (['shadow', 'enforced', 'planned']);

/** Informational token-bypass signals (no other gate bans these outright). */
const TOKEN_BYPASS_PATTERNS = /** @type {const} */ ([
  ['arbitrary-tracking', /tracking-\[[^\]]+\]/g],
  ['arbitrary-px-font-size', /text-\[\d+px\]/g],
  ['arbitrary-hex-utility', /[a-z]-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/g],
]);

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  console.error(`review-findings-lint: ${message}`);
  process.exit(2);
}

/** @returns {{ id?: string, date: string, finding_class: string, layer_encoded: string, pr_url: string | null, notes: string, status?: string }} */
function loadLedger() {
  let raw;
  try {
    raw = readFileSync(LEDGER_PATH, 'utf8');
  } catch {
    return fail(`cannot read ledger at ${relative(WEB_ROOT, LEDGER_PATH)}`);
  }
  /** @type {{ id?: string, date: string, finding_class: string, layer_encoded: string, pr_url: string | null, notes: string, status?: string }[]} */
  const entries = [];
  const lines = raw.split('\n');
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      return fail(
        `findings.jsonl line ${index + 1} is not valid JSON — fix the append`
      );
    }
    const missing = ['date', 'finding_class', 'layer_encoded', 'notes'].filter(
      field => typeof entry[field] !== 'string' || !entry[field]
    );
    if (missing.length) {
      return fail(
        `findings.jsonl line ${index + 1} is missing field(s): ${missing.join(', ')}`
      );
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      return fail(`findings.jsonl line ${index + 1}: date must be YYYY-MM-DD`);
    }
    if (!LAYERS.includes(entry.layer_encoded)) {
      return fail(
        `findings.jsonl line ${index + 1}: layer_encoded must be one of ${LAYERS.join(' | ')}`
      );
    }
    if (
      entry.pr_url !== null &&
      (typeof entry.pr_url !== 'string' || !entry.pr_url)
    ) {
      return fail(
        `findings.jsonl line ${index + 1}: pr_url must be a URL string or null`
      );
    }
    entries.push(entry);
  }
  return entries;
}

function loadRules() {
  /** @type {any} */
  let doc;
  try {
    doc = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
  } catch {
    return fail(`cannot read rules at ${relative(WEB_ROOT, RULES_PATH)}`);
  }
  if (doc.schema !== 'jovie.review-findings.banned-values/v1') {
    return fail('banned-values.json: unexpected schema id');
  }
  if (!Array.isArray(doc.rules)) {
    return fail('banned-values.json: rules must be an array');
  }
  const rules = [];
  for (const rule of doc.rules) {
    for (const field of ['id', 'title', 'source', 'justification']) {
      if (typeof rule[field] !== 'string' || !rule[field]) {
        return fail(
          `banned-values.json rule ${rule.id ?? '?'}: missing ${field}`
        );
      }
    }
    if (!RULE_STATUSES.includes(rule.status)) {
      return fail(
        `banned-values.json rule ${rule.id}: status must be one of ${RULE_STATUSES.join(' | ')}`
      );
    }
    try {
      rules.push({ ...rule, regex: new RegExp(rule.pattern, 'g') });
    } catch (error) {
      return fail(
        `banned-values.json rule ${rule.id}: invalid pattern (${error})`
      );
    }
  }
  return rules;
}

/**
 * Collect .ts/.tsx source files under the scan roots, mirroring the
 * design-system count-ratchet exclusions (*.test.*, __tests__).
 *
 * @param {string} dir
 * @param {string[]} acc
 * @returns {string[]}
 */
function collectSources(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSources(full, acc);
    } else if (
      /\.(ts|tsx)$/.test(entry) &&
      !/\.test\./.test(entry) &&
      !/\.spec\./.test(entry)
    ) {
      acc.push(full);
    }
  }
  return acc;
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const jsonOut = args.includes('--json');

const ledger = loadLedger();
const rules = loadRules();

/** @type {Record<string, { file: string, line: number }[]>} */
const hits = {};
for (const file of SCAN_ROOTS.flatMap(dir => collectSources(dir))) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split('\n');
  for (const rule of rules) {
    rule.regex.lastIndex = 0;
    if (!rule.regex.test(source)) continue;
    for (const [index, line] of lines.entries()) {
      rule.regex.lastIndex = 0;
      if (rule.regex.test(line)) {
        hits[rule.id] ??= [];
        hits[rule.id].push({
          file: relative(WEB_ROOT, file),
          line: index + 1,
        });
      }
    }
  }
}

/** @type {Record<string, number>} */
const tokenBypass = {};
for (const file of SCAN_ROOTS.flatMap(dir => collectSources(dir))) {
  const source = readFileSync(file, 'utf8');
  for (const [name, pattern] of TOKEN_BYPASS_PATTERNS) {
    tokenBypass[name] =
      (tokenBypass[name] ?? 0) + (source.match(pattern)?.length ?? 0);
  }
}

const enforcedHits = rules
  .filter(rule => rule.status === 'enforced')
  .reduce((sum, rule) => sum + (hits[rule.id]?.length ?? 0), 0);

if (jsonOut) {
  console.log(
    JSON.stringify({ ledgerEntries: ledger.length, hits, tokenBypass }, null, 2)
  );
} else {
  console.log(
    `review-findings-lint: ${ledger.length} ledger entr${ledger.length === 1 ? 'y' : 'ies'}, ${rules.length} rule${rules.length === 1 ? '' : 's'}`
  );
  for (const rule of rules) {
    const ruleHits = hits[rule.id] ?? [];
    console.log(
      `  [${rule.status}] ${rule.id} (${rule.source}): ${ruleHits.length} hit${ruleHits.length === 1 ? '' : 's'} — ${rule.title}`
    );
    for (const hit of ruleHits.slice(0, 20)) {
      console.log(`    ${hit.file}:${hit.line}`);
    }
    if (ruleHits.length > 20) {
      console.log(`    ... and ${ruleHits.length - 20} more`);
    }
  }
  console.log('  token-bypass signals (informational):');
  for (const [name, count] of Object.entries(tokenBypass)) {
    console.log(`    ${name}: ${count}`);
  }
}

if (strict && enforcedHits > 0) {
  console.error(
    `review-findings-lint: --strict failed with ${enforcedHits} enforced-rule hit(s)`
  );
  process.exit(1);
}
console.log('review-findings-lint: ok (informational mode)');
