import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REPO_SLUG = Object.freeze({
  'JovieInc/Jovie': 'jovie',
  'JovieInc/LogYourBody': 'lyb',
  'JovieInc/summer-config': 'summer',
  'JovieInc/symphony-control': 'symphony',
});

/** CWE-1000 view parents. Lowest id after this map is the class. */
export const CWE_FAMILY = Object.freeze({
  80: 79,
  83: 79,
  564: 89,
  943: 89,
});

export const KEY_PATTERN =
  /^sec-(jovie|lyb|summer|symphony)-[a-z0-9]+(-[a-z0-9]+)*-([0-9a-f]{8}|grp)$/;

const HTTP_VERBS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});
const TITLE_SOURCE = Object.freeze({
  codeql: 1,
  semgrep: 2,
  trivy: 3,
});
const CODEX_SOURCES = new Set(['codex-cloud', 'daybreak', 'codex-cli']);
const SECRET_SOURCES = new Set(['gitleaks', 'trufflehog']);
const DEPENDENCY_SOURCES = new Set(['osv', 'dependabot']);

const ruleMap = JSON.parse(
  readFileSync(new URL('./rule-cwe-map.json', import.meta.url), 'utf8')
);

export class InvalidKeyError extends Error {
  /**
   * @param {string} code
   */
  constructor(code) {
    super(code);
    this.name = 'InvalidKeyError';
    this.code = code;
  }
}

/**
 * @param {string | null | undefined} ruleId
 */
export function cwesForRule(ruleId) {
  const value = ruleMap[String(ruleId ?? '')];
  const list = Array.isArray(value) ? value : value == null ? [] : [value];
  return list.map(Number).filter(id => Number.isInteger(id) && id > 0);
}

/**
 * @param {string | null | undefined} ruleId
 */
export function slugRule(ruleId) {
  return String(ruleId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
}

/**
 * @param {string | null | undefined} file
 */
export function normalizePath(file) {
  return String(file ?? '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

/**
 * @param {{ source?: string, cwe?: number[], rule_id?: string | null }} finding
 */
export function isSecret(finding) {
  if (SECRET_SOURCES.has(String(finding?.source ?? ''))) return true;
  if ((finding?.cwe ?? []).map(Number).includes(798)) return true;
  return /secret|gitleaks|private-key|api-key/.test(
    String(finding?.rule_id ?? '').toLowerCase()
  );
}

/**
 * @param {{ source?: string, package?: string | null, kind?: string | null }} finding
 */
export function isDependency(finding) {
  if (DEPENDENCY_SOURCES.has(String(finding?.source ?? ''))) return true;
  if (finding?.kind === 'dependency') return true;
  return Boolean(finding?.package);
}

/**
 * @param {{ cwe?: number[], rule_id?: string | null, source?: string }} finding
 */
export function classOf(finding) {
  if (isSecret(finding)) return 'cwe798';
  const mapped = (finding?.cwe ?? [])
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0)
    .map(id => CWE_FAMILY[id] ?? id);
  if (mapped.length > 0) return `cwe${Math.min(...mapped)}`;
  const fromRule = cwesForRule(finding?.rule_id).map(
    id => CWE_FAMILY[id] ?? id
  );
  if (fromRule.length > 0) return `cwe${Math.min(...fromRule)}`;
  return slugRule(finding?.rule_id);
}

/**
 * @param {{ cwe?: number[], rule_id?: string | null, source?: string }} finding
 */
export function familyOf(finding) {
  return classOf(finding);
}

function languageOf(file) {
  const path = String(file ?? '').toLowerCase();
  if (/\.(tsx|ts|mts|cts|jsx|js|mjs|cjs)$/.test(path)) return 'js';
  if (path.endsWith('.swift')) return 'swift';
  if (path.endsWith('.py')) return 'py';
  return 'js';
}

function declarationAt(line, language) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#'))
    return null;
  if (language === 'swift') {
    const func = trimmed.match(
      /^(?:(?:public|private|internal|open|fileprivate|static|final|override|mutating)\s+)*func\s+([A-Za-z_]\w*)/
    );
    if (func) return { kind: 'func', name: func[1] };
    const type = trimmed.match(
      /^(?:(?:public|private|internal|open|fileprivate|final)\s+)*(class|struct)\s+([A-Za-z_]\w*)/
    );
    if (type) return { kind: 'type', name: type[2] };
    return null;
  }
  if (language === 'py') {
    const fn = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/);
    if (fn) return { kind: 'func', name: fn[1] };
    const type = trimmed.match(/^class\s+([A-Za-z_]\w*)/);
    if (type) return { kind: 'type', name: type[1] };
    return null;
  }
  const fn = trimmed.match(
    /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/
  );
  if (fn) return { kind: 'func', name: fn[1] };
  const arrow = trimmed.match(
    /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/
  );
  if (arrow) return { kind: 'func', name: arrow[1] };
  const type = trimmed.match(
    /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/
  );
  if (type) return { kind: 'type', name: type[1] };
  if (!/^(if|for|while|switch|catch|function|return|throw)\b/.test(trimmed)) {
    const method = trimmed.match(
      /^(?:(?:public|private|protected|static|async|readonly|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{?\s*$/
    );
    if (method) return { kind: 'func', name: method[1] };
  }
  return null;
}

function readSource(file, sha, options) {
  if (typeof options.content === 'string') return options.content;
  if (typeof options.readFile === 'function')
    return options.readFile(file, sha);
  if (sha && /^[0-9a-f]{7,40}$/i.test(sha)) {
    try {
      return execFileSync('git', ['show', `${sha}:${file}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return '';
    }
  }
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Walk upward from `line` for the enclosing JS/TS, Swift, or Python symbol.
 * @param {string} file
 * @param {number} line
 * @param {string | null} sha
 * @param {{ content?: string, readFile?: (file: string, sha: string | null) => string }} [options]
 * @returns {string}
 */
export function resolveSymbol(file, line, sha, options = {}) {
  const source = readSource(file, sha, options);
  if (!source) return '';
  const rows = source.split(/\r?\n/);
  const start = Math.min(Math.max(Number(line) || 1, 1), rows.length) - 1;
  const language = languageOf(file);
  let nearest = null;
  for (let index = start; index >= 0; index -= 1) {
    const found = declarationAt(rows[index], language);
    if (!found) continue;
    if (HTTP_VERBS.has(found.name)) return found.name;
    const indented = /^[ \t]/.test(rows[index]);
    if (found.kind === 'func' && !nearest) nearest = found.name;
    if (found.kind === 'type')
      return nearest ? `${found.name}.${nearest}` : found.name;
    if (found.kind === 'func' && !indented) return found.name;
  }
  return nearest ?? '';
}

function anchorFor(finding, options) {
  if (isDependency(finding)) return String(finding.package ?? '').trim();
  if (finding.symbol) return String(finding.symbol);
  if (typeof options.resolveSymbol === 'function') {
    return (
      options.resolveSymbol(
        finding.file ?? '',
        finding.start_line ?? 1,
        finding.commit_sha ?? null
      ) || ''
    );
  }
  if (options.resolveSymbol === true || options.content || options.readFile) {
    return (
      resolveSymbol(
        finding.file ?? '',
        finding.start_line ?? 1,
        finding.commit_sha ?? null,
        options
      ) || ''
    );
  }
  return '';
}

/**
 * @param {{ repo?: string, file?: string | null, symbol?: string | null, cwe?: number[], rule_id?: string | null, source?: string, package?: string | null, kind?: string | null, start_line?: number | null, commit_sha?: string | null }} finding
 * @param {{ resolveSymbol?: boolean | typeof resolveSymbol, content?: string, readFile?: (file: string, sha: string | null) => string }} [options]
 */
export function computeKey(finding, options = {}) {
  const slug = REPO_SLUG[String(finding?.repo ?? '')];
  if (!slug) throw new InvalidKeyError('unknown_repo');
  const klass = classOf(finding);
  if (!klass || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(klass)) {
    throw new InvalidKeyError('bad_class');
  }
  const path = normalizePath(finding.file);
  const anchor = anchorFor(finding, options);
  const hash = createHash('sha256')
    .update(`${path}#${anchor}`)
    .digest('hex')
    .slice(0, 8);
  const key = `sec-${slug}-${klass}-${hash}`;
  if (!KEY_PATTERN.test(key)) throw new InvalidKeyError('invalid_key');
  return key;
}

function lineSpan(finding) {
  const start = Number(finding?.start_line ?? finding?.end_line ?? Number.NaN);
  const end = Number(finding?.end_line ?? finding?.start_line ?? Number.NaN);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  return [Math.min(start, end), Math.max(start, end)];
}

function spansOverlap(left, right, pad) {
  if (!left || !right) return false;
  return left[0] - pad <= right[1] + pad && right[0] - pad <= left[1] + pad;
}

/**
 * Cross-scanner match. Different commits need an explicit line map.
 * @param {Record<string, any>} left
 * @param {Record<string, any>} right
 * @param {{ mapLines?: (left: any, right: any) => { left: any, right: any } | null }} [options]
 */
export function match(left, right, options = {}) {
  if (REPO_SLUG[left?.repo] !== REPO_SLUG[right?.repo]) return false;
  if (!REPO_SLUG[left?.repo]) return false;
  if (familyOf(left) !== familyOf(right)) return false;
  if (normalizePath(left?.file) !== normalizePath(right?.file)) return false;
  if (String(left?.symbol ?? '') === String(right?.symbol ?? '')) return true;
  const leftSha = left?.commit_sha || null;
  const rightSha = right?.commit_sha || null;
  const sameSha = leftSha === rightSha;
  if (!sameSha) {
    const mapped = options.mapLines?.(left, right) ?? null;
    if (!mapped) return false;
    return spansOverlap(lineSpan(mapped.left), lineSpan(mapped.right), 5);
  }
  return spansOverlap(lineSpan(left), lineSpan(right), 5);
}

function titleRank(finding) {
  if (finding?.validated && CODEX_SOURCES.has(finding.source)) return 0;
  return TITLE_SOURCE[finding?.source] ?? 4;
}

/**
 * First-seen key stays canonical. Other keys become aliases.
 * @param {Record<string, any>[]} records
 */
export function merge(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new InvalidKeyError('empty_merge');
  }
  const ordered = [...records].sort((left, right) =>
    String(left.first_seen ?? '').localeCompare(String(right.first_seen ?? ''))
  );
  const canonical = ordered[0];
  const severity = records.reduce((current, record) => {
    const rank = SEVERITY_RANK[record.severity] ?? -1;
    return rank > (SEVERITY_RANK[current] ?? -1) ? record.severity : current;
  }, 'info');
  const titleFrom = [...records].sort(
    (left, right) => titleRank(left) - titleRank(right)
  )[0];
  const dismissed = records.some(
    record =>
      record.status === 'false_positive' || record.status === 'dismissed'
  );
  const stillOpen = records.some(
    record => record.status === 'open' && record.coverage === 'complete'
  );
  const aliases = [
    ...new Set(
      ordered
        .slice(1)
        .map(record => record.key)
        .filter(key => key && key !== canonical.key)
    ),
  ];
  return {
    ...canonical,
    key: canonical.key,
    aliases,
    severity,
    validated: records.some(record => record.validated === true),
    title: titleFrom.title,
    conflict: dismissed && stillOpen,
    sources: records.map(record => ({
      source: record.source,
      source_id: record.source_id,
      url: record.url ?? null,
      last_seen: record.last_seen ?? null,
      severity: record.severity,
    })),
  };
}
