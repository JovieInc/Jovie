// Golden Path assurance ratchets (JOV-7998).
//
// docs/golden-path/coverage-map.md is the step -> executable-test inventory.
// This module parses it and enforces three ratchets that only move one way:
//   1. MISSING rows may not grow, REAL rows (real or real-but-gated) may not
//      shrink, and the row count may not shrink (a row cannot be deleted to
//      hide a gap).
//   2. Every non-MISSING row must name a test file that exists in the repo, so
//      a renamed or deleted test cannot leave the map claiming coverage.
//   3. Every contract module in scripts/golden-path-assurance.json has a
//      mutation floor in scripts/mutation-score-baseline.json or sits in
//      `pendingBaseline`, which only shrinks. A module that gains a floor must
//      leave the list.
// It also ranks the modules by stage volume x risk weight so the mutation
// sweep runs the highest-traffic contract modules first.

export const STATUS_CLASSES = Object.freeze([
  'REAL',
  'REAL_GATED',
  'MOCKED',
  'SKIPPED_GATED',
  'MISSING',
  'NA',
]);

/** @param {string} text */
export function classifyStatus(text) {
  const status = text.trim();
  if (status.startsWith('MISSING')) return 'MISSING';
  if (status.startsWith('N/A')) return 'NA';
  if (status.startsWith('MOCKED')) return 'MOCKED';
  if (status.startsWith('REAL')) {
    return /SKIPPED|gated/u.test(status) ? 'REAL_GATED' : 'REAL';
  }
  if (status.startsWith('SKIPPED')) return 'SKIPPED_GATED';
  throw new Error(`unrecognised status "${status}"`);
}

/**
 * @param {string} markdown
 * @returns {{ id: string, step: string, variant: string, test: string, level: string, status: string, statusClass: string, main: string }[]}
 */
export function parseCoverageMap(markdown) {
  const rows = [];
  for (const line of markdown.split('\n')) {
    if (!/^\| [A-Z]+\d+ \|/u.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (cells.length !== 7) {
      throw new Error(`coverage map row must have 7 cells: ${line}`);
    }
    const [id, step, variant, test, level, status, main] = cells;
    rows.push({
      id,
      step,
      variant,
      test,
      level,
      status,
      statusClass: classifyStatus(status),
      main,
    });
  }
  const ids = new Set(rows.map(row => row.id));
  if (ids.size !== rows.length) throw new Error('duplicate coverage map ids');
  return rows;
}

/** @param {{ statusClass: string }[]} rows */
export function measureCoverageMap(rows) {
  const counts = Object.fromEntries(STATUS_CLASSES.map(name => [name, 0]));
  for (const row of rows) counts[row.statusClass] += 1;
  return {
    rows: rows.length,
    real: counts.REAL + counts.REAL_GATED,
    missing: counts.MISSING,
    counts,
  };
}

const TEST_TOKEN =
  /[\w./[\]-]+\.(?:test|spec)\.(?:tsx?|mjs)|golden-path-billing\.ts|golden-path\.spec\.ts/gu;

/**
 * Test files a row names. Brace shorthand (`a.{x,y}.test.ts`) is expanded.
 * @param {string} cell
 */
export function referencedTestFiles(cell) {
  const expanded = cell.replace(
    /([\w./[\]-]*)\{([^}]+)\}([\w./[\]-]*)/gu,
    (_, pre, alts, post) =>
      alts
        .split(',')
        .map(alt => `${pre}${alt.trim()}${post}`)
        .join(' ')
  );
  return [...new Set(expanded.match(TEST_TOKEN) ?? [])];
}

/**
 * Rows that claim a test the repo does not have.
 * @param {{ id: string, test: string, statusClass: string }[]} rows
 * @param {readonly string[]} trackedFiles
 */
export function unresolvedReferences(rows, trackedFiles) {
  const problems = [];
  for (const row of rows) {
    if (row.statusClass === 'MISSING' || row.statusClass === 'NA') continue;
    const tokens = referencedTestFiles(row.test);
    if (tokens.length === 0) {
      problems.push(`${row.id}: names no test file`);
      continue;
    }
    for (const token of tokens) {
      if (
        !trackedFiles.some(file => file === token || file.endsWith(`/${token}`))
      ) {
        problems.push(`${row.id}: ${token} is not a tracked file`);
      }
    }
  }
  return problems;
}

/**
 * @param {ReturnType<typeof measureCoverageMap>} measured
 * @param {{ map: { rowsFloor: number, realFloor: number, missingCeiling: number } }} baseline
 */
export function checkMapRatchet(measured, baseline) {
  const failures = [];
  const { rowsFloor, realFloor, missingCeiling } = baseline.map;
  if (measured.rows < rowsFloor) {
    failures.push(
      `map rows ${measured.rows} < floor ${rowsFloor} (a gap cannot be deleted from the map)`
    );
  }
  if (measured.real < realFloor) {
    failures.push(`real-path rows ${measured.real} < floor ${realFloor}`);
  }
  if (measured.missing > missingCeiling) {
    failures.push(
      `missing rows ${measured.missing} > ceiling ${missingCeiling}`
    );
  }
  return failures;
}

/**
 * @param {{ modules: { path: string }[] }} manifest
 * @param {{ files: Record<string, unknown> }} mutationBaseline
 * @param {{ mutation: { pendingBaseline: string[] } }} baseline
 */
export function checkModuleBaselines(manifest, mutationBaseline, baseline) {
  const failures = [];
  const pending = new Set(baseline.mutation.pendingBaseline);
  const paths = new Set(manifest.modules.map(module => module.path));
  for (const path of paths) {
    const hasFloor = Object.hasOwn(mutationBaseline.files, path);
    if (!hasFloor && !pending.has(path)) {
      failures.push(`${path}: no mutation floor and not in pendingBaseline`);
    }
    if (hasFloor && pending.has(path)) {
      failures.push(
        `${path}: has a mutation floor, remove it from pendingBaseline`
      );
    }
  }
  for (const path of pending) {
    if (!paths.has(path))
      failures.push(`${path}: pendingBaseline entry is not a manifest module`);
  }
  return failures;
}

/**
 * Highest first. Score = stage volume x risk weight.
 * @param {{ riskWeights: Record<string, number>, stageVolume30d: Record<string, number | string>, modules: { path: string, stage: string, risk: string }[] }} manifest
 * @param {Record<string, number>} [stageCounts] overrides manifest volumes
 */
export function rankModules(manifest, stageCounts = {}) {
  const volume = stage => {
    const value = stageCounts[stage] ?? manifest.stageVolume30d[stage];
    return typeof value === 'number' ? value : 0;
  };
  return manifest.modules
    .map(module => ({
      path: module.path,
      stage: module.stage,
      score:
        (volume(module.stage) + 1) * (manifest.riskWeights[module.risk] ?? 1),
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
}

/** @param {{ path: string, score: number }[]} ranked */
export function priorityWeights(ranked) {
  return new Map(ranked.map(entry => [entry.path, entry.score]));
}
