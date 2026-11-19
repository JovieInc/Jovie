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
 *   - Ledger and rules integrity are always validated (code 2 when either is
 *     malformed — a bad append must fail loudly even in informational mode).
 *   - Default mode is INFORMATIONAL: prints rule hits and token-bypass
 *     signals and exits 0. This check is non-required until promoted.
 *   - --strict exits 1 on any enforced-rule hit. That is the promotion
 *     target once the repeat-finding bar in review-findings/README.md is met.
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
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(SCRIPT_DIR, '..');
const FINDINGS_DIR = join(WEB_ROOT, 'review-findings');

const LAYERS = ['token', 'component', 'lint', 'visual', 'env', 'doc'];
const RULE_STATUSES = ['shadow', 'enforced', 'planned'];

/** Informational token-bypass signals (no other gate bans these outright). */
const TOKEN_BYPASS_PATTERNS = [
  ['arbitrary-tracking', /tracking-\[[^\]]+\]/g],
  ['arbitrary-px-font-size', /text-\[\d+px\]/g],
  ['arbitrary-hex-utility', /[a-z]-\[#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\]/g],
];

/** @param {string} message @returns {{ code: 2 }} */
function integrity(message, error = console.error) {
  error(`review-findings-lint: ${message}`);
  return { code: 2 };
}

/** @returns {{ entries: object[] } | { code: 2 }} */
export function parseLedger(text, error = console.error) {
  const entries = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      return {
        code: integrity(
          `findings.jsonl line ${index + 1} is not valid JSON — fix the append`,
          error
        ).code,
      };
    }
    const missing = ['date', 'finding_class', 'layer_encoded', 'notes'].filter(
      field => typeof entry[field] !== 'string' || !entry[field]
    );
    if (missing.length) {
      return {
        code: integrity(
          `findings.jsonl line ${index + 1} is missing field(s): ${missing.join(', ')}`,
          error
        ).code,
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      return {
        code: integrity(
          `findings.jsonl line ${index + 1}: date must be YYYY-MM-DD`,
          error
        ).code,
      };
    }
    if (!LAYERS.includes(entry.layer_encoded)) {
      return {
        code: integrity(
          `findings.jsonl line ${index + 1}: layer_encoded must be one of ${LAYERS.join(' | ')}`,
          error
        ).code,
      };
    }
    if (
      entry.pr_url !== null &&
      (typeof entry.pr_url !== 'string' || !entry.pr_url)
    ) {
      return {
        code: integrity(
          `findings.jsonl line ${index + 1}: pr_url must be a URL string or null`,
          error
        ).code,
      };
    }
    entries.push(entry);
  }
  return { entries };
}

/** @returns {{ rules: object[] } | { code: 2 }} */
export function parseRules(text, error = console.error) {
  let doc;
  try {
    doc = JSON.parse(text);
  } catch {
    return {
      code: integrity(
        `cannot read rules (invalid JSON) — see ${relative(WEB_ROOT, join(FINDINGS_DIR, 'banned-values.json'))}`,
        error
      ).code,
    };
  }
  if (doc.schema !== 'jovie.review-findings.banned-values/v1') {
    return {
      code: integrity('banned-values.json: unexpected schema id', error).code,
    };
  }
  if (!Array.isArray(doc.rules)) {
    return {
      code: integrity('banned-values.json: rules must be an array', error).code,
    };
  }
  const rules = [];
  for (const rule of doc.rules) {
    for (const field of ['id', 'title', 'source', 'justification']) {
      if (typeof rule[field] !== 'string' || !rule[field]) {
        return {
          code: integrity(
            `banned-values.json rule ${rule.id ?? '?'}: missing ${field}`,
            error
          ).code,
        };
      }
    }
    if (!RULE_STATUSES.includes(rule.status)) {
      return {
        code: integrity(
          `banned-values.json rule ${rule.id}: status must be one of ${RULE_STATUSES.join(' | ')}`,
          error
        ).code,
      };
    }
    try {
      rules.push({ ...rule, regex: new RegExp(rule.pattern, 'g') });
    } catch (error_) {
      return {
        code: integrity(
          `banned-values.json rule ${rule.id}: invalid pattern (${error_})`,
          error
        ).code,
      };
    }
  }
  return { rules };
}

/**
 * Collect .ts/.tsx source files under the scan roots, mirroring the
 * design-system count-ratchet exclusions (*.test.*, __tests__).
 */
export function collectSources(dir, acc = []) {
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

/**
 * Run the lint. Returns { code } — 0 informational-clean, 1 --strict with
 * enforced-rule hits, 2 integrity failure.
 *
 * @param {{
 *   args?: string[],
 *   ledgerText?: string,
 *   rulesText?: string,
 *   webRoot?: string,
 *   scanRoots?: string[],
 *   log?: (...a: unknown[]) => void,
 *   error?: (...a: unknown[]) => void,
 * }} [options]
 */
export function lintReviewFindings(options = {}) {
  const {
    args = [],
    ledgerText,
    rulesText,
    webRoot = WEB_ROOT,
    scanRoots = ['components', 'app'].map(dir => join(webRoot, dir)),
    log = () => {},
    error = (...a) => console.error(...a),
  } = options;

  const ledger = ledgerText
    ? parseLedger(ledgerText, error)
    : parseLedger(
        readFileSync(join(webRoot, 'review-findings/findings.jsonl'), 'utf8'),
        error
      );
  if ('code' in ledger) return ledger;

  const rules = rulesText
    ? parseRules(rulesText, error)
    : parseRules(
        readFileSync(
          join(webRoot, 'review-findings/banned-values.json'),
          'utf8'
        ),
        error
      );
  if ('code' in rules) return rules;

  const sources = scanRoots.flatMap(dir => collectSources(dir));

  /** @type {Record<string, { file: string, line: number }[]>} */
  const hits = {};
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    for (const rule of rules.rules) {
      rule.regex.lastIndex = 0;
      if (!rule.regex.test(source)) continue;
      for (const [index, line] of lines.entries()) {
        rule.regex.lastIndex = 0;
        if (rule.regex.test(line)) {
          hits[rule.id] ??= [];
          hits[rule.id].push({
            file: relative(webRoot, file),
            line: index + 1,
          });
        }
      }
    }
  }

  /** @type {Record<string, number>} */
  const tokenBypass = {};
  for (const file of sources) {
    const source = readFileSync(file, 'utf8');
    for (const [name, pattern] of TOKEN_BYPASS_PATTERNS) {
      tokenBypass[name] =
        (tokenBypass[name] ?? 0) + (source.match(pattern)?.length ?? 0);
    }
  }

  const enforcedHits = rules.rules
    .filter(rule => rule.status === 'enforced')
    .reduce((sum, rule) => sum + (hits[rule.id]?.length ?? 0), 0);

  if (args.includes('--json')) {
    log(
      JSON.stringify(
        { ledgerEntries: ledger.entries.length, hits, tokenBypass },
        null,
        2
      )
    );
  } else {
    log(
      `review-findings-lint: ${ledger.entries.length} ledger entr${ledger.entries.length === 1 ? 'y' : 'ies'}, ${rules.rules.length} rule${rules.rules.length === 1 ? '' : 's'}`
    );
    for (const rule of rules.rules) {
      const ruleHits = hits[rule.id] ?? [];
      log(
        `  [${rule.status}] ${rule.id} (${rule.source}): ${ruleHits.length} hit${ruleHits.length === 1 ? '' : 's'} — ${rule.title}`
      );
      for (const hit of ruleHits.slice(0, 20)) {
        log(`    ${hit.file}:${hit.line}`);
      }
      if (ruleHits.length > 20) {
        log(`    ... and ${ruleHits.length - 20} more`);
      }
    }
    log('  token-bypass signals (informational):');
    for (const [name, count] of Object.entries(tokenBypass)) {
      log(`    ${name}: ${count}`);
    }
  }

  if (args.includes('--strict') && enforcedHits > 0) {
    error(
      `review-findings-lint: --strict failed with ${enforcedHits} enforced-rule hit(s)`
    );
    return { code: 1 };
  }
  if (!args.includes('--json')) {
    log('review-findings-lint: ok (informational mode)');
  }
  return { code: 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = lintReviewFindings({
    args: process.argv.slice(2),
    log: (...a) => console.log(...a),
  }).code;
}
