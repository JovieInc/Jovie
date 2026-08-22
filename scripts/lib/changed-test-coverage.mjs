import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const MIN_CHANGED_LINE_COVERAGE = 60;

const SOURCE_PATH = /^apps\/web\/.*\.(?:[cm]?[jt]sx?)$/;
const EXCLUDED_SOURCE_PATH =
  /(?:^|\/)(?:__tests__|__mocks__|tests)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$|\.d\.ts$|\.config(?:\.[^./]+)*\.[cm]?[jt]s$|(?:^|\/)types?(?:\/|\.[cm]?ts$)|(?:^|\/)(?:layout|loading|not-found)\.tsx$/;

export function isCoverageSourcePath(path) {
  return SOURCE_PATH.test(path) && !EXCLUDED_SOURCE_PATH.test(path);
}

export function parseChangedLines(diff) {
  const changed = new Map();
  let currentPath = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const value = line.slice(4).trim();
      currentPath =
        value === '/dev/null'
          ? null
          : value.startsWith('b/')
            ? value.slice(2)
            : value;
      continue;
    }

    if (!currentPath || !line.startsWith('@@ ')) continue;
    const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (count === 0) continue;

    const lines = changed.get(currentPath) ?? new Set();
    for (let offset = 0; offset < count; offset += 1) {
      lines.add(start + offset);
    }
    changed.set(currentPath, lines);
  }

  return changed;
}

function normalizeCoveragePath(path, repoRoot) {
  if (path.startsWith(repoRoot)) {
    return relative(repoRoot, path).replaceAll('\\', '/');
  }
  const marker = '/apps/web/';
  const markerIndex = path.replaceAll('\\', '/').indexOf(marker);
  return markerIndex >= 0
    ? path.replaceAll('\\', '/').slice(markerIndex + 1)
    : path.replaceAll('\\', '/');
}

export function evaluateChangedLineCoverage({
  changedLines,
  coverage,
  repoRoot = REPO_ROOT,
  minimum = MIN_CHANGED_LINE_COVERAGE,
}) {
  const sourceChanges = [...changedLines.entries()].filter(([path]) =>
    isCoverageSourcePath(path)
  );
  if (sourceChanges.length === 0) {
    return {
      ok: true,
      applicable: false,
      minimum,
      coveredLines: 0,
      coverableLines: 0,
      percentage: null,
      files: [],
      missingFiles: [],
    };
  }

  const coverageByPath = new Map(
    Object.entries(coverage).map(([path, value]) => [
      normalizeCoveragePath(path, repoRoot),
      value,
    ])
  );
  const files = [];
  const missingFiles = [];
  let coveredLines = 0;
  let coverableLines = 0;

  for (const [path, lines] of sourceChanges) {
    const fileCoverage = coverageByPath.get(path);
    if (!fileCoverage) {
      missingFiles.push(path);
      continue;
    }

    const statements = Object.entries(fileCoverage.statementMap ?? {});
    let fileCovered = 0;
    let fileCoverable = 0;
    for (const line of lines) {
      const statementIds = statements
        .filter(([, location]) => {
          const start = location?.start?.line;
          const end = location?.end?.line;
          return Number.isInteger(start) && Number.isInteger(end)
            ? start <= line && line <= end
            : false;
        })
        .map(([id]) => id);
      if (statementIds.length === 0) continue;

      fileCoverable += 1;
      if (statementIds.some(id => Number(fileCoverage.s?.[id] ?? 0) > 0)) {
        fileCovered += 1;
      }
    }

    coveredLines += fileCovered;
    coverableLines += fileCoverable;
    files.push({
      path,
      coveredLines: fileCovered,
      coverableLines: fileCoverable,
    });
  }

  const percentage =
    coverableLines === 0
      ? null
      : Math.round((coveredLines / coverableLines) * 1000) / 10;
  const ok =
    missingFiles.length === 0 && (percentage === null || percentage >= minimum);

  return {
    ok,
    applicable: true,
    minimum,
    coveredLines,
    coverableLines,
    percentage,
    files,
    missingFiles,
  };
}

export function formatChangedLineCoverage(result) {
  if (!result.applicable) {
    return 'No changed web product source requires patch coverage.';
  }
  if (result.missingFiles.length > 0) {
    return `Changed web source missing from V8 coverage: ${result.missingFiles.join(', ')}`;
  }
  if (result.percentage === null) {
    return 'Changed web source contains no coverable statement lines.';
  }
  return `Changed-line coverage: ${result.coveredLines}/${result.coverableLines} (${result.percentage}%; required ${result.minimum}%).`;
}

export function runChangedLineCoverageCheck({
  base,
  head,
  coveragePath = resolve(REPO_ROOT, 'apps/web/coverage/coverage-final.json'),
  repoRoot = REPO_ROOT,
}) {
  const shaPattern = /^[0-9a-f]{40}$/;
  if (!shaPattern.test(base) || !shaPattern.test(head)) {
    throw new Error('Exact base and head must be full lowercase Git SHAs.');
  }
  const actualHead = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  if (actualHead !== head) {
    throw new Error(
      `Coverage head mismatch: expected ${head}, checked out ${actualHead}.`
    );
  }
  execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], {
    cwd: repoRoot,
    stdio: 'ignore',
  });
  const diff = execFileSync(
    'git',
    [
      'diff',
      '--unified=0',
      '--diff-filter=ACMR',
      '--no-renames',
      `${base}...${head}`,
      '--',
      'apps/web',
    ],
    { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
  );
  const coverage = JSON.parse(readFileSync(coveragePath, 'utf8'));
  return evaluateChangedLineCoverage({
    changedLines: parseChangedLines(diff),
    coverage,
    repoRoot,
  });
}
