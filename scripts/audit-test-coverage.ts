#!/usr/bin/env tsx
/**
 * Test coverage heatmap generator.
 *
 * Reads:
 *   docs/TEST_RISK_REGISTER.md             — YAML front-matter, hand-curated surface taxonomy
 *   apps/web/coverage/coverage-final.json  — v8 line/branch coverage per file
 *   apps/web/reports/stryker-incremental.json — Stryker mutation score per file (optional)
 *   .context/test-coverage-snapshot.json   — previous snapshot, for Δ7d (optional)
 *
 * Writes:
 *   docs/TEST_COVERAGE_HEATMAP.md          — committed, idempotent (only writes on change)
 *   .context/test-coverage-snapshot.json   — gitignored snapshot used by --check-pr
 *
 * Modes:
 *   (default)         — regenerate the heatmap
 *   --check-pr        — compare current coverage to the snapshot in main; exit 1 if any RED surface dropped ≥3pp
 *   --dry-run         — print outputs, don't write
 *
 * Owner: Jovie test platform
 * Spec: docs/TEST_RISK_REGISTER.md
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { glob } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const REGISTER_PATH = resolve(REPO_ROOT, 'docs/TEST_RISK_REGISTER.md');
const HEATMAP_PATH = resolve(REPO_ROOT, 'docs/TEST_COVERAGE_HEATMAP.md');
const SNAPSHOT_PATH = resolve(
  REPO_ROOT,
  '.context/test-coverage-snapshot.json'
);
const COVERAGE_PATH = resolve(
  REPO_ROOT,
  'apps/web/coverage/coverage-final.json'
);
const STRYKER_PATH = resolve(
  REPO_ROOT,
  'apps/web/reports/stryker-incremental.json'
);
const FLAKY_PATH = resolve(
  REPO_ROOT,
  'apps/web/tests/quarantine/flaky-tests.json'
);

interface Surface {
  id: string;
  surface: string;
  glob: string;
  key_ranges: string[];
  blast_radius: number;
  reversibility: number;
  visibility: number;
  target_coverage: number;
  target_e2e: number;
  owner: string;
  last_incident: string | null;
  lessons_ref: string | null;
  notes: string;
  last_reviewed: string;
}

interface SurfaceMetrics {
  coverage_pct: number;
  branch_pct: number;
  files_in_glob: number;
  files_covered: number;
  unit_count: number;
  integration_count: number;
  e2e_count: number;
  mutation_score: number | null;
  meaningful_assertion_ratio: number;
  status: 'RED' | 'YELLOW' | 'GREEN';
  risk_score: number;
  delta_7d: number;
}

interface Snapshot {
  generated_at: string;
  surfaces: Record<
    string,
    Pick<
      SurfaceMetrics,
      'coverage_pct' | 'branch_pct' | 'risk_score' | 'status'
    >
  >;
}

// ---------------------------------------------------------------------------
// Minimal YAML front-matter parser, tailored to TEST_RISK_REGISTER.md schema.
// Handles: top-level scalars, `surfaces:` array of objects with scalar fields,
// a `key_ranges:` list of strings, and `notes: >-` folded block scalars.
// ---------------------------------------------------------------------------

function parseRegister(): { surfaces: Surface[]; lastReviewed: string } {
  const raw = readFileSync(REGISTER_PATH, 'utf8');
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error(`No YAML front-matter found in ${REGISTER_PATH}`);
  const yaml = match[1];

  // Strip comment lines and empty lines.
  const lines = yaml.split('\n').filter(l => !l.trimStart().startsWith('#'));

  let i = 0;
  let lastReviewed = '';
  const surfaces: Surface[] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('last_reviewed:')) {
      lastReviewed = stripQuotes(line.split(':').slice(1).join(':').trim());
      i++;
      continue;
    }
    if (line === 'surfaces:') {
      i++;
      while (
        i < lines.length &&
        (lines[i].startsWith('  - ') ||
          lines[i].startsWith('    ') ||
          lines[i] === '')
      ) {
        if (lines[i].startsWith('  - ')) {
          const { surface, consumed } = parseSurface(lines, i);
          surfaces.push(surface);
          i += consumed;
        } else {
          i++;
        }
      }
      continue;
    }
    i++;
  }

  return { surfaces, lastReviewed };
}

function parseSurface(
  lines: string[],
  start: number
): { surface: Surface; consumed: number } {
  const s: Partial<Surface> = { key_ranges: [], notes: '' };
  let i = start;
  // First line: `  - id: foo`
  const firstLine = lines[i].replace(/^\s*-\s*/, '');
  applyKv(s, firstLine);
  i++;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('    ')) break;
    if (line.startsWith('  - ')) break;
    const trimmed = line.slice(4);

    if (trimmed.startsWith('key_ranges:')) {
      i++;
      while (i < lines.length && lines[i].startsWith('      - ')) {
        s.key_ranges!.push(lines[i].replace(/^\s+-\s*/, '').trim());
        i++;
      }
      // Handle empty inline `key_ranges: []`
      if (trimmed.includes('[]')) {
        s.key_ranges = [];
      }
      continue;
    }

    if (trimmed.startsWith('notes: >-')) {
      i++;
      const notesLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('      ')) {
        notesLines.push(lines[i].trim());
        i++;
      }
      s.notes = notesLines.join(' ');
      continue;
    }

    applyKv(s, trimmed);
    i++;
  }

  return { surface: s as Surface, consumed: i - start };
}

function applyKv(target: Record<string, unknown>, line: string) {
  const idx = line.indexOf(':');
  if (idx === -1) return;
  const key = line.slice(0, idx).trim();
  let raw = line.slice(idx + 1).trim();
  raw = stripQuotes(raw);
  let value: unknown = raw;
  if (raw === 'null' || raw === '') value = null;
  else if (raw === 'true') value = true;
  else if (raw === 'false') value = false;
  else if (/^-?\d+$/.test(raw)) value = Number(raw);
  else if (raw === '[]') value = [];
  target[key] = value;
}

function stripQuotes(s: string): string {
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Coverage data ingestion
// ---------------------------------------------------------------------------

interface V8FileCoverage {
  path: string;
  statementMap: Record<string, unknown>;
  s: Record<string, number>;
  branchMap: Record<string, unknown>;
  b: Record<string, number[]>;
}

interface V8Coverage {
  [file: string]: V8FileCoverage;
}

function readCoverage(): V8Coverage | null {
  if (!existsSync(COVERAGE_PATH)) return null;
  return JSON.parse(readFileSync(COVERAGE_PATH, 'utf8')) as V8Coverage;
}

function readStryker(): Record<string, number> | null {
  if (!existsSync(STRYKER_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(STRYKER_PATH, 'utf8')) as {
      files?: Record<string, { mutants?: Array<{ status: string }> }>;
    };
    if (!raw.files) return null;
    const scores: Record<string, number> = {};
    for (const [file, payload] of Object.entries(raw.files)) {
      const mutants = payload.mutants ?? [];
      if (mutants.length === 0) continue;
      const killed = mutants.filter(m => m.status === 'Killed').length;
      scores[file] = Math.round((killed / mutants.length) * 100);
    }
    return scores;
  } catch {
    return null;
  }
}

function readPreviousSnapshot(): Snapshot | null {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as Snapshot;
  } catch {
    return null;
  }
}

interface FlakyTest {
  testName: string;
  flakyScore: number;
  reason: string;
}

interface FlakyReport {
  timestamp: string;
  flakyTests: FlakyTest[];
}

function readFlakyTests(): FlakyReport | null {
  if (!existsSync(FLAKY_PATH)) return null;
  try {
    return JSON.parse(readFileSync(FLAKY_PATH, 'utf8')) as FlakyReport;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// File-glob matching (no external deps; minimal globstar handling)
// ---------------------------------------------------------------------------

function globToRegex(pattern: string): RegExp {
  // Strip line ranges (e.g. "apps/web/proxy.ts:204-246" → "apps/web/proxy.ts")
  const pathOnly = pattern.split(':')[0];
  let re = '^';
  let i = 0;
  while (i < pathOnly.length) {
    const ch = pathOnly[i];
    if (ch === '*' && pathOnly[i + 1] === '*') {
      re += '.*';
      i += 2;
      if (pathOnly[i] === '/') i++;
    } else if (ch === '*') {
      re += '[^/]*';
      i++;
    } else if ('.+?()|[]{}^$\\'.includes(ch)) {
      re += '\\' + ch;
      i++;
    } else {
      re += ch;
      i++;
    }
  }
  re += '$';
  return new RegExp(re);
}

async function listFilesMatching(pattern: string): Promise<string[]> {
  const pathOnly = pattern.split(':')[0];
  if (!pathOnly.includes('*')) {
    // Single file
    return existsSync(resolve(REPO_ROOT, pathOnly)) ? [pathOnly] : [];
  }
  const matched: string[] = [];
  // Use Node 22's built-in async glob with cwd=REPO_ROOT
  for await (const f of glob(pathOnly, { cwd: REPO_ROOT })) {
    matched.push(f);
  }
  return matched;
}

// ---------------------------------------------------------------------------
// Compute metrics per surface
// ---------------------------------------------------------------------------

async function computeMetrics(
  surface: Surface,
  coverage: V8Coverage | null,
  stryker: Record<string, number> | null,
  testInventory: TestInventory,
  previousSnapshot: Snapshot | null
): Promise<SurfaceMetrics> {
  const files = await listFilesMatching(surface.glob);
  const filesInGlob = files.length;

  let totalStatements = 0;
  let coveredStatements = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  let filesCovered = 0;

  if (coverage) {
    for (const [absPath, fileCov] of Object.entries(coverage)) {
      const rel = relative(REPO_ROOT, absPath).replaceAll('\\', '/');
      if (!files.includes(rel)) continue;
      const stmts = Object.values(fileCov.s);
      const covered = stmts.filter(c => c > 0).length;
      const branches = Object.values(fileCov.b).flat();
      const coveredBr = branches.filter(c => c > 0).length;
      totalStatements += stmts.length;
      coveredStatements += covered;
      totalBranches += branches.length;
      coveredBranches += coveredBr;
      if (covered > 0) filesCovered++;
    }
  }

  const coverage_pct =
    totalStatements > 0
      ? Math.round((coveredStatements / totalStatements) * 1000) / 10
      : 0;
  const branch_pct =
    totalBranches > 0
      ? Math.round((coveredBranches / totalBranches) * 1000) / 10
      : 0;

  // Test layer counts: tests matching this surface's glob via test name → source name convention.
  const { unitCount, integrationCount, e2eCount, assertionRatio } =
    countSurfaceTests(surface, testInventory);

  // Mutation score: average of per-file Stryker scores within glob.
  let mutationScore: number | null = null;
  if (stryker) {
    const scores = files.flatMap(f =>
      stryker[f] !== undefined ? [stryker[f]] : []
    );
    if (scores.length > 0) {
      mutationScore = Math.round(
        scores.reduce((a, b) => a + b, 0) / scores.length
      );
    }
  }

  const coverage_score =
    branch_pct * 0.4 + coverage_pct * 0.4 + assertionRatio * 100 * 0.2;
  const e2eBonus =
    e2eCount >= surface.target_e2e && surface.target_e2e > 0 ? -5 : 0;
  const riskScore =
    surface.blast_radius * 5 +
    surface.reversibility * 3 +
    surface.visibility * 2 -
    coverage_score / 10 +
    e2eBonus;

  let status: 'RED' | 'YELLOW' | 'GREEN';
  if (riskScore >= 30) status = 'RED';
  else if (riskScore >= 18) status = 'YELLOW';
  else status = 'GREEN';

  const prev = previousSnapshot?.surfaces[surface.id];
  const delta_7d = prev
    ? Math.round((coverage_pct - prev.coverage_pct) * 10) / 10
    : 0;

  return {
    coverage_pct,
    branch_pct,
    files_in_glob: filesInGlob,
    files_covered: filesCovered,
    unit_count: unitCount,
    integration_count: integrationCount,
    e2e_count: e2eCount,
    mutation_score: mutationScore,
    meaningful_assertion_ratio: Math.round(assertionRatio * 100) / 100,
    status,
    risk_score: Math.round(riskScore * 10) / 10,
    delta_7d,
  };
}

// ---------------------------------------------------------------------------
// Test inventory
// ---------------------------------------------------------------------------

interface TestInventory {
  unit: string[];
  integration: string[];
  e2e: string[];
  assertionsPerFile: Record<string, number>;
  statementsPerFile: Record<string, number>;
}

async function buildTestInventory(): Promise<TestInventory> {
  const inv: TestInventory = {
    unit: [],
    integration: [],
    e2e: [],
    assertionsPerFile: {},
    statementsPerFile: {},
  };

  const testPatterns = [
    'apps/web/**/*.test.ts',
    'apps/web/**/*.test.tsx',
    'apps/web/tests/e2e/**/*.spec.ts',
    'packages/**/*.test.ts',
    'packages/**/*.test.tsx',
  ];

  for (const pattern of testPatterns) {
    for await (const f of glob(pattern, { cwd: REPO_ROOT })) {
      const rel = String(f).replaceAll('\\', '/');
      if (rel.includes('node_modules/')) continue;
      if (rel.includes('tests/e2e/')) inv.e2e.push(rel);
      else if (rel.includes('tests/integration/')) inv.integration.push(rel);
      else inv.unit.push(rel);
    }
  }

  return inv;
}

function countSurfaceTests(
  surface: Surface,
  inventory: TestInventory
): {
  unitCount: number;
  integrationCount: number;
  e2eCount: number;
  assertionRatio: number;
} {
  const tokens = extractTokens(surface);
  const matches = (testPath: string) =>
    tokens.some(t => testPath.toLowerCase().includes(t));

  const unitCount = inventory.unit.filter(matches).length;
  const integrationCount = inventory.integration.filter(matches).length;
  const e2eCount = inventory.e2e.filter(matches).length;

  // Stub for assertion ratio — would require parsing each test file.
  // Conservative default: 0.5 (assumes tests have meaningful assertions).
  const assertionRatio = 0.5;

  return { unitCount, integrationCount, e2eCount, assertionRatio };
}

// Generic path segments to ignore when extracting matching tokens — they appear
// in too many test paths and would match everything.
const GENERIC_PATH_SEGMENTS = new Set([
  'apps',
  'web',
  'app',
  'api',
  'lib',
  'src',
  'tests',
  'test',
  'unit',
  'integration',
  'e2e',
  'spec',
  'dev',
  'auth',
  'utils',
  'helpers',
  'config',
  'route',
  'routes',
  'page',
  'pages',
  'index',
  'common',
  'components',
]);

function extractTokens(surface: Surface): string[] {
  // Use distinctive path segments from the glob, plus the surface id.
  // For "apps/web/app/api/stripe/webhooks/**" → ['stripe', 'webhooks', 'stripe/webhooks', 'stripe-webhooks']
  const pathOnly = surface.glob.split(':')[0].replace(/\/\*\*?$/, '');
  const segments = pathOnly
    .split('/')
    .map(s => s.toLowerCase().replace(/[()]/g, ''))
    .filter(
      s =>
        s.length > 0 &&
        !GENERIC_PATH_SEGMENTS.has(s) &&
        !s.startsWith('[') &&
        !s.includes('*')
    );

  const tokens = new Set<string>();
  if (segments.length > 0) {
    tokens.add(segments[segments.length - 1]);
    if (segments.length >= 2) {
      tokens.add(segments.slice(-2).join('/'));
    }
  }
  // Also include the surface id itself if it's distinctive (has a hyphen).
  if (surface.id.includes('-')) {
    tokens.add(surface.id);
  }
  return Array.from(tokens);
}

// ---------------------------------------------------------------------------
// Priority queue + drift detection
// ---------------------------------------------------------------------------

interface PriorityRow {
  surface: Surface;
  metrics: SurfaceMetrics;
  priorityScore: number;
}

function priorityQueue(
  rows: Array<{ surface: Surface; metrics: SurfaceMetrics }>
): PriorityRow[] {
  return rows
    .map(r => ({
      ...r,
      priorityScore:
        r.metrics.risk_score *
        Math.max(0, r.surface.target_coverage - r.metrics.coverage_pct),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 5);
}

async function detectStaleRows(surfaces: Surface[]): Promise<Surface[]> {
  const stale: Surface[] = [];
  for (const s of surfaces) {
    const files = await listFilesMatching(s.glob);
    if (files.length === 0) stale.push(s);
  }
  return stale;
}

async function detectUnmappedHighChurn(surfaces: Surface[]): Promise<string[]> {
  // Files changed in the last 90 days with significant churn that match no glob.
  let churnRaw = '';
  try {
    churnRaw = execSync(
      'git log --since=90.days --name-only --pretty=format: -- apps/web',
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      }
    );
  } catch {
    return [];
  }
  const files = churnRaw
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && (l.endsWith('.ts') || l.endsWith('.tsx')))
    .filter(l => !l.includes('.test.') && !l.includes('.spec.'));

  const churnCount: Record<string, number> = {};
  for (const f of files) churnCount[f] = (churnCount[f] ?? 0) + 1;

  const regexes = surfaces.map(s => globToRegex(s.glob));
  const hotUnmapped: string[] = [];
  for (const [file, count] of Object.entries(churnCount)) {
    if (count < 5) continue; // Skip cold files
    const mapped = regexes.some(re => re.test(file));
    if (!mapped) hotUnmapped.push(`${file} (${count} commits)`);
  }
  return hotUnmapped.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------

function renderHeatmap(
  rows: Array<{ surface: Surface; metrics: SurfaceMetrics }>,
  priority: PriorityRow[],
  stale: Surface[],
  unmappedChurn: string[],
  coverageSource: string,
  flakyReport: FlakyReport | null
): string {
  const now = new Date().toISOString();
  rows.sort((a, b) => b.metrics.risk_score - a.metrics.risk_score);

  const tableRows = rows.map(r => {
    const delta =
      r.metrics.delta_7d === 0
        ? '0'
        : r.metrics.delta_7d > 0
          ? `+${r.metrics.delta_7d}`
          : `${r.metrics.delta_7d}`;
    const mut =
      r.metrics.mutation_score === null ? '—' : `${r.metrics.mutation_score}%`;
    return `| \`${r.surface.id}\` | ${r.metrics.risk_score} | ${r.metrics.coverage_pct}% | ${r.surface.target_coverage}% | ${delta} | ${r.metrics.branch_pct}% | ${r.metrics.unit_count} | ${r.metrics.integration_count} | ${r.metrics.e2e_count} | ${mut} | **${r.metrics.status}** |`;
  });

  const priorityList = priority.map((p, idx) => {
    const gap = p.surface.target_coverage - p.metrics.coverage_pct;
    const ranges =
      p.surface.key_ranges.length > 0
        ? p.surface.key_ranges.join(', ')
        : p.surface.glob;
    return `${idx + 1}. **${p.surface.surface}** — gap ${gap.toFixed(1)}pp, risk ${p.metrics.risk_score} → add tests at \`${ranges}\``;
  });

  const staleSection =
    stale.length === 0
      ? '_No stale rows — every registered surface still matches files in the repo._'
      : stale
          .map(s => `- \`${s.id}\` (glob \`${s.glob}\` matches zero files)`)
          .join('\n');

  const unmappedSection =
    unmappedChurn.length === 0
      ? '_No high-churn files outside any registered surface._'
      : unmappedChurn.map(f => `- \`${f}\``).join('\n');

  // Flake summary — surface-level when possible, otherwise overall.
  let flakeSection: string;
  if (!flakyReport) {
    flakeSection =
      '_No flake report found at `apps/web/tests/quarantine/flaky-tests.json`. Run `pnpm test:flaky` to populate._';
  } else if (flakyReport.flakyTests.length === 0) {
    flakeSection = `_No flaky tests detected as of ${flakyReport.timestamp}._`;
  } else {
    const sorted = [...flakyReport.flakyTests].sort(
      (a, b) => b.flakyScore - a.flakyScore
    );
    flakeSection = [
      `_${flakyReport.flakyTests.length} flaky test${flakyReport.flakyTests.length === 1 ? '' : 's'} detected as of ${flakyReport.timestamp}._`,
      '',
      '| Test | Flaky Score | Reason |',
      '|------|-------------|--------|',
      ...sorted
        .slice(0, 15)
        .map(
          t =>
            `| \`${t.testName}\` | ${(t.flakyScore * 100).toFixed(1)}% | ${t.reason} |`
        ),
    ].join('\n');
  }

  // Mutation warnings: surfaces with high coverage % but no mutation data, or low mutation score.
  const mutationWarnings: string[] = [];
  for (const r of rows) {
    if (r.metrics.coverage_pct >= 60 && r.metrics.mutation_score === null) {
      mutationWarnings.push(
        `- \`${r.surface.id}\` — ${r.metrics.coverage_pct}% coverage but no mutation score. Risk: assertions may exercise code without verifying behavior. Add to \`apps/web/stryker.config.mjs\` \`mutate[]\`.`
      );
    } else if (
      r.metrics.mutation_score !== null &&
      r.metrics.mutation_score < 60 &&
      r.metrics.coverage_pct >= 60
    ) {
      mutationWarnings.push(
        `- \`${r.surface.id}\` — ${r.metrics.coverage_pct}% line coverage but only ${r.metrics.mutation_score}% mutation score. Tests are not killing meaningful mutants.`
      );
    }
  }
  const mutationSection =
    mutationWarnings.length === 0
      ? '_All measured surfaces have acceptable mutation scores or are below the coverage threshold for mutation analysis._'
      : mutationWarnings.join('\n');

  return `<!-- AUTO-GENERATED by scripts/audit-test-coverage.ts — do not edit by hand. -->
<!-- Source: ${REGISTER_PATH.replace(REPO_ROOT + '/', '')} -->
<!-- Coverage: ${coverageSource} -->
<!-- Generated: ${now} -->

# Test Coverage Heatmap

> **Question this answers:** "Which surfaces are underprotected relative to their risk?"
>
> Auto-generated nightly. Hand-curated taxonomy lives in [\`TEST_RISK_REGISTER.md\`](TEST_RISK_REGISTER.md).
> Strategy in [\`TESTING_GUIDELINES.md\`](TESTING_GUIDELINES.md) → "Risk-Based Testing".

## Surface Heatmap

Sorted by risk score (descending). Status thresholds: \`RED ≥30\`, \`YELLOW 18–29\`, \`GREEN <18\`.

| Surface | Risk | Cov % | Target | Δ7d | Branch % | Unit | Int | E2E | Mut | Status |
|---------|------|-------|--------|-----|----------|------|-----|-----|-----|--------|
${tableRows.join('\n')}

## Priority Queue

Top 5 by \`risk_score × coverage_gap\`. Start here.

${priorityList.join('\n')}

## Stale Risk Rows (Drift Detector)

${staleSection}

## Unmapped High-Churn Files

Files with ≥5 commits in the last 90 days that aren't covered by any registered surface. Each should either get a register row or be deliberately excluded.

${unmappedSection}

## Flake Tracking

${flakeSection}

## Mutation Score Warnings

Tests can run code without verifying its behavior. Mutation testing kills mutants where assertions are weak. This section surfaces surfaces where coverage % is high but mutation evidence is missing or weak — the classic "incidental coverage" pattern.

${mutationSection}

## How to Read This

- **Risk** is calibrated by blast radius (1-5), reversibility (1-5), and visibility (1-5) per the register, minus a coverage discount.
- **Cov %** is statement coverage from v8 (\`apps/web/coverage/coverage-final.json\`).
- **Branch %** is branch coverage from v8 — the metric that actually matters for critical paths.
- **Mut** is mutation score from Stryker (\`apps/web/reports/stryker-incremental.json\`). \`—\` means Stryker hasn't run for this surface.
- **Δ7d** is coverage delta vs the previous snapshot at \`.context/test-coverage-snapshot.json\`.

## Update Cadence

Nightly cron at \`0 6 * * *\` UTC via \`.github/workflows/test-coverage-audit.yml\`. On-demand via \`pnpm tsx scripts/audit-test-coverage.ts\`.
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const checkPr = args.includes('--check-pr');

  const { surfaces } = parseRegister();
  const coverage = readCoverage();
  const stryker = readStryker();
  const previousSnapshot = readPreviousSnapshot();
  const flakyReport = readFlakyTests();

  if (!coverage) {
    console.error(
      `WARN: No coverage at ${COVERAGE_PATH}. Run \`pnpm --filter web test:coverage\` first.`
    );
    console.error(
      'Continuing with zero coverage so the heatmap structure renders.'
    );
  }

  const testInventory = await buildTestInventory();

  const rows: Array<{ surface: Surface; metrics: SurfaceMetrics }> = [];
  for (const surface of surfaces) {
    const metrics = await computeMetrics(
      surface,
      coverage,
      stryker,
      testInventory,
      previousSnapshot
    );
    rows.push({ surface, metrics });
  }

  const priority = priorityQueue(rows);
  const stale = await detectStaleRows(surfaces);
  const unmappedChurn = await detectUnmappedHighChurn(surfaces);

  const coverageSource = coverage
    ? 'apps/web/coverage/coverage-final.json'
    : '(missing — run test:coverage)';
  const md = renderHeatmap(
    rows,
    priority,
    stale,
    unmappedChurn,
    coverageSource,
    flakyReport
  );

  // PR-check mode: compare current to snapshot in main, exit 1 on RED degradation.
  if (checkPr) {
    if (!previousSnapshot) {
      console.log('No previous snapshot found — skipping check.');
      process.exit(0);
    }
    const baseline = previousSnapshot;
    const degraded: string[] = [];
    for (const r of rows) {
      const prev = baseline.surfaces[r.surface.id];
      if (!prev) continue;
      if (
        r.metrics.status === 'RED' &&
        r.metrics.coverage_pct - prev.coverage_pct <= -3
      ) {
        degraded.push(
          `${r.surface.id}: ${prev.coverage_pct}% → ${r.metrics.coverage_pct}%`
        );
      }
    }
    if (degraded.length > 0) {
      console.error('Coverage regression on RED surfaces (≥3pp drop):');
      for (const d of degraded) console.error(`  - ${d}`);
      process.exit(1);
    }
    console.log('No regression on RED surfaces.');
    process.exit(0);
  }

  // Write snapshot
  const snapshot: Snapshot = {
    generated_at: new Date().toISOString(),
    surfaces: Object.fromEntries(
      rows.map(r => [
        r.surface.id,
        {
          coverage_pct: r.metrics.coverage_pct,
          branch_pct: r.metrics.branch_pct,
          risk_score: r.metrics.risk_score,
          status: r.metrics.status,
        },
      ])
    ),
  };

  if (dryRun) {
    console.log('--- HEATMAP ---');
    console.log(md);
    console.log('--- SNAPSHOT ---');
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n');

  const existing = existsSync(HEATMAP_PATH)
    ? readFileSync(HEATMAP_PATH, 'utf8')
    : '';
  // Idempotent: only write if content meaningfully changed (ignore timestamp lines).
  const stripTs = (s: string) => s.replace(/<!-- Generated: .*? -->/g, '');
  if (stripTs(existing) !== stripTs(md)) {
    writeFileSync(HEATMAP_PATH, md);
    console.log(`Wrote ${HEATMAP_PATH}`);
  } else {
    console.log(`No change — ${HEATMAP_PATH} not rewritten.`);
  }
  console.log(`Wrote ${SNAPSHOT_PATH}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
