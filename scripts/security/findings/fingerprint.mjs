import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const REPO_SLUG = Object.freeze({
  'JovieInc/Jovie': 'jovie',
  'JovieInc/LogYourBody': 'lyb',
  'JovieInc/summer-config': 'summer',
  'JovieInc/symphony-control': 'symphony',
});

const CWE_FAMILY = Object.freeze({ 80: 79, 83: 79, 564: 89, 943: 89 });
const DEPENDENCY_SOURCES = new Set(['dependabot', 'osv']);
const SECRET_SOURCES = new Set(['gitleaks', 'trufflehog']);
const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
});
const ruleCweMap = JSON.parse(
  readFileSync(new URL('./rule-cwe-map.json', import.meta.url), 'utf8')
);

export class InvalidFindingError extends Error {
  constructor(code) {
    super(code);
    this.name = 'InvalidFindingError';
    this.code = code;
  }
}

export function normalizePath(file) {
  return String(file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
    .toLowerCase();
}

export function isDependency(finding) {
  return (
    DEPENDENCY_SOURCES.has(String(finding?.source ?? '')) ||
    finding?.kind === 'dependency' ||
    Boolean(finding?.package)
  );
}

export function isSecret(finding) {
  return (
    SECRET_SOURCES.has(String(finding?.source ?? '')) ||
    (finding?.cwe ?? []).map(Number).includes(798) ||
    /(?:api[-_ ]?key|private[-_ ]?key|secret)/i.test(finding?.rule_id ?? '')
  );
}

export function cwesForRule(ruleId) {
  const value = ruleCweMap[String(ruleId ?? '')];
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  return values.map(Number).filter(id => Number.isInteger(id) && id > 0);
}

function slugRule(ruleId) {
  return String(ruleId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
}

export function familyOf(finding) {
  if (isSecret(finding)) return 'cwe798';
  const cwes = [...(finding?.cwe ?? []), ...cwesForRule(finding?.rule_id)]
    .map(Number)
    .filter(id => Number.isInteger(id) && id > 0)
    .map(id => CWE_FAMILY[id] ?? id);
  return cwes.length > 0
    ? `cwe${Math.min(...cwes)}`
    : slugRule(finding?.rule_id);
}

export function computeKey(finding) {
  const repo = REPO_SLUG[String(finding?.repo ?? '')];
  if (!repo) throw new InvalidFindingError('unknown_repo');
  const family = familyOf(finding);
  if (!family) throw new InvalidFindingError('missing_cwe_or_rule');
  const file = normalizePath(finding?.file);
  const symbol = isDependency(finding)
    ? String(finding?.package ?? '')
    : String(finding?.symbol ?? '');
  const hash = createHash('sha256')
    .update(`${file}#${symbol}`)
    .digest('hex')
    .slice(0, 8);
  return `sec-${repo}-${family}-${hash}`;
}

function span(finding) {
  const start = Number(finding?.start_line ?? finding?.end_line);
  const end = Number(finding?.end_line ?? finding?.start_line);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  return [Math.min(start, end), Math.max(start, end)];
}

function overlaps(left, right, padding = 5) {
  return Boolean(
    left &&
      right &&
      left[0] - padding <= right[1] &&
      right[0] - padding <= left[1]
  );
}

export function sameFinding(left, right) {
  if (!REPO_SLUG[left?.repo] || left?.repo !== right?.repo) return false;
  if (familyOf(left) !== familyOf(right)) return false;
  if (normalizePath(left?.file) !== normalizePath(right?.file)) return false;
  const leftSymbol = String(left?.symbol ?? '');
  const rightSymbol = String(right?.symbol ?? '');
  return (
    (leftSymbol === rightSymbol && leftSymbol.length > 0) ||
    overlaps(span(left), span(right))
  );
}

export function mergeFindings(records) {
  if (!Array.isArray(records) || records.length === 0) {
    throw new InvalidFindingError('empty_merge');
  }
  const ordered = [...records].sort((left, right) =>
    String(left.first_seen ?? '').localeCompare(String(right.first_seen ?? ''))
  );
  const canonical = ordered[0];
  const strongest = records.reduce((best, finding) =>
    (SEVERITY_RANK[finding.severity] ?? -1) >
    (SEVERITY_RANK[best.severity] ?? -1)
      ? finding
      : best
  );
  const dismissed = records.some(finding =>
    ['dismissed', 'false_positive'].includes(finding.status)
  );
  const completeOpen = records.some(
    finding => finding.status === 'open' && finding.coverage === 'complete'
  );
  return {
    ...canonical,
    aliases: [
      ...new Set(
        ordered
          .slice(1)
          .map(finding => finding.key)
          .filter(key => key && key !== canonical.key)
      ),
    ],
    severity: strongest.severity,
    validated: records.some(finding => finding.validated === true),
    conflict: dismissed && completeOpen,
    sources: records.map(finding => ({
      source: finding.source,
      source_id: finding.source_id,
      url: finding.url ?? null,
      last_seen: finding.last_seen ?? null,
      severity: finding.severity,
    })),
  };
}
