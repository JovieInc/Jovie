#!/usr/bin/env node
/**
 * Shared-UI visual arbitrary-value audit (JOV-5437): shrink-only
 * file/value/count for all production TypeScript under packages/ui.
 * Exclusions: tests, stories, fixtures, generated output, build/tooling,
 * plus token kinds that are not one-off visual values (state/aria, CSS
 * vars, transition lists, empty content-[], CSS-property syntax).
 * pnpm design:shared-ui-visual-arbitrary:{check,update}
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(THIS_DIR, '..');
export const SCHEMA = 'jovie.shared-ui-visual-arbitrary/v1';
export const BASELINE_PATH = 'scripts/shared-ui-visual-arbitrary.baseline.json';
export const SCAN_ROOTS = Object.freeze(['packages/ui']);
export const CHECK_COMMAND = 'pnpm design:shared-ui-visual-arbitrary:check';
export const UPDATE_COMMAND = 'pnpm design:shared-ui-visual-arbitrary:update';

const SOURCE_EXT = /\.(tsx|ts)$/;
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.next',
  'dist',
  'coverage',
  'generated',
  'fixtures',
]);
const SKIP_PRODUCTION =
  /\.(?:test|spec|stories)\.[cm]?[jt]sx?$|\/(?:fixtures|generated|dist|coverage)\/|(?:^|\/)(?:vitest|jest)\.(?:config|setup)\.[cm]?[jt]sx?$/;
const ARBITRARY_TOKEN =
  /(?:^|[\s"'`])((?:[!a-z][\w-]*:)*!?[a-z][\w-]*-\[[^\]]+\]|\[[a-z-]+:[^\]]+\])/g;
const STATE_UTILITY = /^(?:group-|peer-)?(?:data|aria)-\[/;
const HAS_CSS_VAR = /var\(--|--[a-z]/;
const TRANSITION_UTILITY = /^transition-\[/;
const EMPTY_CONTENT = /^content-\[(?:""|'')]$/;

export const KINDS = Object.freeze({
  VISUAL: 'visual',
  STATE: 'state',
  CSS_VAR: 'css-var',
  TRANSITION: 'transition',
  CONTENT: 'content',
  CSS_PROPERTY: 'css-property',
});

const MERGE_GROUP = 'merge_group';

/**
 * @typedef {{ file: string, value: string, count: number }} Finding
 * @typedef {{ schema: string, scope: string[], totalFindings: number, findings: Finding[] }} Baseline
 * @typedef {{ ok: boolean, status: 'pass'|'regression'|'unbaselined_shrink'|'sibling_shrink', issues: string[], findings: Finding[], totalFindings: number, scannedFiles: string[], eventName: string }} AuditResult
 */

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveCount(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function classifySharedUiArbitraryToken(token) {
  const normalized = token.replace(/^!/, '');
  const parts = normalized.split(':');
  const utility = parts[parts.length - 1] ?? '';

  if (STATE_UTILITY.test(utility) && !/\]:/.test(utility)) {
    return KINDS.STATE;
  }
  if (TRANSITION_UTILITY.test(utility)) return KINDS.TRANSITION;
  if (EMPTY_CONTENT.test(utility)) return KINDS.CONTENT;
  if (HAS_CSS_VAR.test(utility) || HAS_CSS_VAR.test(normalized)) {
    return KINDS.CSS_VAR;
  }
  if (!utility.includes('[')) return KINDS.CSS_PROPERTY;
  return KINDS.VISUAL;
}

export function extractSharedUiArbitraryTokens(source) {
  const matches = [];
  ARBITRARY_TOKEN.lastIndex = 0;
  for (const match of source.matchAll(ARBITRARY_TOKEN)) {
    const token = match[1];
    matches.push({
      token,
      kind: classifySharedUiArbitraryToken(token),
    });
  }
  return matches;
}

export function collectVisualArbitraryFindingsFromSource(relativePath, source) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const { token, kind } of extractSharedUiArbitraryTokens(source)) {
    if (kind !== KINDS.VISUAL) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, count]) => ({ file: relativePath, value, count }));
}

function walkSourceFiles(dir, shouldSkip, repoRoot, out) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) continue;
      walkSourceFiles(full, shouldSkip, repoRoot, out);
      continue;
    }
    if (!SOURCE_EXT.test(entry.name)) continue;
    const relativePath = relative(repoRoot, full).replaceAll('\\', '/');
    if (shouldSkip(relativePath)) continue;
    out.push(relativePath);
  }
}

export function isSharedUiProductionSource(relativePath) {
  return (
    SCAN_ROOTS.some(root => relativePath.startsWith(`${root}/`)) &&
    SOURCE_EXT.test(relativePath) &&
    !SKIP_PRODUCTION.test(relativePath)
  );
}

export function scanSharedUiVisualArbitrary(repoRoot = REPO_ROOT) {
  /** @type {string[]} */
  const scannedFiles = [];
  for (const root of SCAN_ROOTS) {
    walkSourceFiles(
      join(repoRoot, root),
      relativePath => !isSharedUiProductionSource(relativePath),
      repoRoot,
      scannedFiles
    );
  }
  scannedFiles.sort((left, right) => left.localeCompare(right));

  /** @type {Finding[]} */
  const findings = [];
  for (const relativePath of scannedFiles) {
    const source = readFileSync(join(repoRoot, relativePath), 'utf8');
    findings.push(
      ...collectVisualArbitraryFindingsFromSource(relativePath, source)
    );
  }
  findings.sort((left, right) => {
    const file = left.file.localeCompare(right.file);
    return file !== 0 ? file : left.value.localeCompare(right.value);
  });
  return {
    scannedFiles,
    findings,
    totalFindings: findings.reduce((sum, item) => sum + item.count, 0),
  };
}

export function findingIndex(findings) {
  const index = new Map();
  for (const finding of findings) {
    index.set(`${finding.file}\0${finding.value}`, finding.count);
  }
  return index;
}

/**
 * @typedef {{ schema?: unknown, scope?: unknown, findings?: unknown, totalFindings?: unknown, file?: unknown, value?: unknown, count?: unknown }} UntrustedBaseline
 */

/**
 * @param {unknown} baseline
 * @returns {string[]}
 */
export function validateVisualArbitraryBaseline(baseline) {
  const errors = [];
  if (!isObject(baseline)) return ['baseline must be a JSON object'];
  const record = /** @type {UntrustedBaseline} */ (baseline);
  if (record.schema !== SCHEMA) {
    errors.push(`schema must be ${SCHEMA}; got ${record.schema}`);
  }
  if (
    !Array.isArray(record.scope) ||
    record.scope.length !== SCAN_ROOTS.length ||
    SCAN_ROOTS.some((root, index) => record.scope[index] !== root)
  ) {
    errors.push(`scope must be ${JSON.stringify(SCAN_ROOTS)}`);
  }
  if (!Array.isArray(record.findings)) {
    errors.push('findings must be an array');
    return errors;
  }

  let sum = 0;
  let previousKey = '';
  for (const rawFinding of record.findings) {
    const finding = /** @type {UntrustedBaseline} */ (
      isObject(rawFinding) ? rawFinding : {}
    );
    if (
      typeof finding.file !== 'string' ||
      typeof finding.value !== 'string' ||
      !isPositiveCount(finding.count)
    ) {
      errors.push('each finding requires file, value, and a positive count');
      continue;
    }
    const count = /** @type {number} */ (finding.count);
    if (!isSharedUiProductionSource(finding.file)) {
      errors.push(`finding file is outside production scope: ${finding.file}`);
    }
    const key = `${finding.file}\0${finding.value}`;
    if (key <= previousKey) {
      errors.push(
        `findings must be unique and sorted by file, then value (${finding.file} ${finding.value})`
      );
    }
    previousKey = key;
    sum += count;
  }
  if (record.totalFindings !== sum) {
    errors.push(
      `totalFindings ${record.totalFindings} does not match finding counts ${sum}`
    );
  }
  return errors;
}

export function compareVisualArbitraryBaseline(
  current,
  baseline,
  options = {}
) {
  const eventName = options.eventName ?? 'local';
  const currentIndex = findingIndex(current);
  const baselineIndex = findingIndex(baseline.findings ?? []);
  /** @type {string[]} */
  const growth = [];
  /** @type {string[]} */
  const shrink = [];

  for (const [key, count] of currentIndex) {
    const [file, value] = key.split('\0');
    const baselineCount = baselineIndex.get(key) ?? 0;
    if (count > baselineCount) {
      growth.push(`${file} ${value} ×${count} (baseline ×${baselineCount})`);
    }
  }
  for (const [key, baselineCount] of baselineIndex) {
    const [file, value] = key.split('\0');
    const count = currentIndex.get(key) ?? 0;
    if (count < baselineCount) {
      shrink.push(`${file} ${value} ×${count} (baseline ×${baselineCount})`);
    }
  }

  if (growth.length > 0) {
    return {
      ok: false,
      status: /** @type {const} */ ('regression'),
      issues: [
        `shared-UI visual arbitrary values grew (${growth.length}):`,
        ...growth.map(item => `  ${item}`),
        'Use design-system tokens instead of adding new one-off visual values.',
      ],
    };
  }

  if (shrink.length > 0) {
    if (eventName === MERGE_GROUP) {
      return {
        ok: true,
        status: /** @type {const} */ ('sibling_shrink'),
        issues: [
          `shared-UI visual arbitrary values dropped (${shrink.length}); merge_group allows the unbaselined shrink so a sibling cannot UNMERGEABLE the ALLGREEN group. The PR that changed the count must still lower the baseline.`,
        ],
      };
    }
    return {
      ok: false,
      status: /** @type {const} */ ('unbaselined_shrink'),
      issues: [
        `shared-UI visual arbitrary values dropped (${shrink.length}). Lower the baseline with \`${UPDATE_COMMAND}\`:`,
        ...shrink.map(item => `  ${item}`),
      ],
    };
  }

  return {
    ok: true,
    status: /** @type {const} */ ('pass'),
    issues: [],
  };
}

export function toVisualArbitraryBaseline(findings) {
  return {
    schema: SCHEMA,
    scope: [...SCAN_ROOTS],
    totalFindings: findings.reduce((sum, item) => sum + item.count, 0),
    findings,
  };
}

export function serializeVisualArbitraryBaseline(baseline) {
  const findings = baseline.findings
    .map(finding => `    ${JSON.stringify(finding)}`)
    .join(',\n');
  return [
    '{',
    `  "schema": ${JSON.stringify(baseline.schema)},`,
    `  "scope": ${JSON.stringify(baseline.scope)},`,
    `  "totalFindings": ${baseline.totalFindings},`,
    '  "findings": [',
    findings,
    '  ]',
    '}',
    '',
  ].join('\n');
}

export function evaluateSharedUiVisualArbitraryAudit(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const eventName =
    options.eventName ?? process.env.GITHUB_EVENT_NAME ?? 'local';
  const measured = scanSharedUiVisualArbitrary(repoRoot);
  const baseline =
    options.baseline ??
    JSON.parse(readFileSync(join(repoRoot, BASELINE_PATH), 'utf8'));
  const schemaIssues = validateVisualArbitraryBaseline(baseline);
  if (schemaIssues.length > 0) {
    return {
      ok: false,
      status: 'regression',
      issues: schemaIssues,
      findings: measured.findings,
      totalFindings: measured.totalFindings,
      scannedFiles: measured.scannedFiles,
      eventName,
    };
  }
  const comparison = compareVisualArbitraryBaseline(
    measured.findings,
    baseline,
    { eventName }
  );
  return {
    ok: comparison.ok,
    status: comparison.status,
    issues: comparison.issues,
    findings: measured.findings,
    totalFindings: measured.totalFindings,
    scannedFiles: measured.scannedFiles,
    eventName,
  };
}

function main() {
  const repoRoot = REPO_ROOT;
  const updateMode = process.argv.includes('--update-baseline');
  const measured = scanSharedUiVisualArbitrary(repoRoot);
  if (updateMode) {
    const baseline = toVisualArbitraryBaseline(measured.findings);
    writeFileSync(
      join(repoRoot, BASELINE_PATH),
      serializeVisualArbitraryBaseline(baseline)
    );
    console.log(
      `[shared-ui-visual-arbitrary] baseline updated → ${BASELINE_PATH} ` +
        `(${baseline.totalFindings} findings across ${measured.scannedFiles.length} production files)`
    );
    return;
  }

  const result = evaluateSharedUiVisualArbitraryAudit({
    repoRoot,
    eventName: process.env.GITHUB_EVENT_NAME ?? 'local',
  });
  if (!result.ok) {
    console.error(
      `[shared-ui-visual-arbitrary] FAIL — ${result.totalFindings} findings in ${result.scannedFiles.length} production files`
    );
    for (const issue of result.issues) console.error(issue);
    process.exitCode = 1;
    return;
  }
  console.log(
    `[shared-ui-visual-arbitrary] PASS — ${result.totalFindings} findings match the shrink-only baseline ` +
      `(${result.scannedFiles.length} production files${result.status === 'sibling_shrink' ? ', sibling shrink' : ''})`
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
