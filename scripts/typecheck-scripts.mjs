#!/usr/bin/env node
/**
 * Typecheck coverage for the scripts/ tree with a shrink-only error baseline
 * (JOV-4327).
 *
 * Motivation: the .mjs scripts run on plain Node and the .ts scripts (hermes
 * jobs) run via tsx in prod hermes monitors, but no CI lane type-checked them. A
 * nonexistent `chdirSync` import from `node:fs` survived review and
 * crash-looped two hermes monitors (ci-failure-monitor, pr-stuck-monitor) —
 * fixed in #14527. This lane catches that class (TS2305 bad named import,
 * TS2307 missing module, TS2304 unknown name, TS2339 unknown property, …)
 * before it ships.
 *
 * Ratchet semantics (mirrors the repo's ratchet philosophy):
 * - `tsc -p scripts/tsconfig.json` runs over the whole scripts/ tree.
 * - Pre-existing errors are recorded in scripts/typecheck-baseline.json as
 *   per-file, per-error-code counts (no line numbers, so unrelated edits in a
 *   file do not churn the baseline).
 * - FAIL when any (file, code) count EXCEEDS the baseline — i.e. any new
 *   error, any newly-dirty file, or any error in a file not in the baseline.
 * - FAIL when the baseline holds entries for errors that no longer exist —
 *   fixing errors must shrink the baseline in the same PR:
 *     pnpm run typecheck:scripts:update
 *   Regrowing the baseline via that command is visible as JSON diff in review.
 * - FAIL CLOSED before any baseline write when tsc exits nonzero with no
 *   parseable TypeScript diagnostics (missing binary, crash, OOM). An empty
 *   parse from a failed compiler must not publish a false zero-error baseline.
 * - Config-level errors (no file prefix, e.g. TS2688 missing @types/node)
 *   always fail — they mean the check itself is broken and must never pass.
 *
 * Usage:
 *   node scripts/typecheck-scripts.mjs                  # check (CI + local)
 *   node scripts/typecheck-scripts.mjs --update-baseline # regenerate baseline
 *
 * Env:
 *   SCRIPTS_TYPECHECK_BASELINE_PATH  Override baseline path (tests).
 *   SCRIPTS_TYPECHECK_TSCONFIG_PATH  Override tsconfig path (tests).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

export const BASELINE_SCHEMA_VERSION = 1;
export const DEFAULT_BASELINE_PATH = resolve(
  REPO_ROOT,
  'scripts/typecheck-baseline.json'
);
export const DEFAULT_TSCONFIG_PATH = resolve(
  REPO_ROOT,
  'scripts/tsconfig.json'
);

const ERROR_LINE_PATTERN = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const GLOBAL_ERROR_PATTERN = /^error (TS\d+): (.*)$/;

/** @typedef {Map<string, Map<string, number>>} ErrorCounts file → code → count */

/**
 * Parse `tsc --pretty false` output into per-(file, code) counts plus global
 * (file-less) errors. File paths are normalized to repo-root-relative.
 * @param {string} output
 * @returns {{ counts: ErrorCounts, globalErrors: string[], lines: Map<string, string[]> }}
 */
export function parseTscOutput(output) {
  /** @type {ErrorCounts} */
  const counts = new Map();
  /** @type {string[]} */
  const globalErrors = [];
  /** @type {Map<string, string[]>} key `${file}::${code}` → raw error lines */
  const lines = new Map();

  for (const rawLine of (output || '').split('\n')) {
    const line = rawLine.trim();
    const fileMatch = ERROR_LINE_PATTERN.exec(line);
    if (fileMatch) {
      const [, file, , , code] = fileMatch;
      const normalized = relative(REPO_ROOT, resolve(REPO_ROOT, file));
      if (!counts.has(normalized)) counts.set(normalized, new Map());
      const byCode = counts.get(normalized);
      byCode.set(code, (byCode.get(code) ?? 0) + 1);
      const key = `${normalized}::${code}`;
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push(line);
      continue;
    }
    if (GLOBAL_ERROR_PATTERN.test(line)) {
      globalErrors.push(line);
    }
  }
  return { counts, globalErrors, lines };
}

const countFor = (counts, file, code) => counts.get(file)?.get(code) ?? 0;

/**
 * Compare current error counts against a baseline.
 * @param {ErrorCounts} current
 * @param {{ files?: Record<string, Record<string, number>> }} baseline
 * @returns {{ ok: boolean, newErrors: Array<{ file: string, code: string, count: number, baseline: number }>, staleEntries: Array<{ file: string, code: string, count: number, baseline: number }> }}
 */
export function compareWithBaseline(current, baseline) {
  const baselineFiles = baseline?.files ?? {};
  /** @type {Array<{ file: string, code: string, count: number, baseline: number }>} */
  const newErrors = [];
  /** @type {Array<{ file: string, code: string, count: number, baseline: number }>} */
  const staleEntries = [];

  for (const [file, byCode] of current) {
    for (const [code, count] of byCode) {
      const baselineCount = baselineFiles[file]?.[code] ?? 0;
      if (count > baselineCount) {
        newErrors.push({ file, code, count, baseline: baselineCount });
      }
    }
  }
  for (const [file, byCode] of Object.entries(baselineFiles)) {
    for (const [code, baselineCount] of Object.entries(byCode)) {
      const currentCount = countFor(current, file, code);
      if (currentCount < baselineCount) {
        staleEntries.push({
          file,
          code,
          count: currentCount,
          baseline: baselineCount,
        });
      }
    }
  }
  return {
    ok: newErrors.length === 0 && staleEntries.length === 0,
    newErrors,
    staleEntries,
  };
}

/** @param {ErrorCounts} counts */
export function totalErrors(counts) {
  let total = 0;
  for (const byCode of counts.values()) {
    for (const count of byCode.values()) total += count;
  }
  return total;
}

export function isSupportedTypecheckNode(version = process.version) {
  return /^v22\./.test(String(version));
}

/**
 * A compiler run is only authoritative when tsc either succeeded (status 0)
 * or produced at least one parseable TypeScript diagnostic. Nonzero exits
 * with an empty parse are missing/crashed compilers, not a clean tree.
 * @param {{ status?: number | null, counts?: ErrorCounts, globalErrors?: string[] }} result
 */
export function compilerRunHasParseableDiagnostics(result) {
  const status = result?.status ?? 1;
  const counts = result?.counts ?? new Map();
  const globalErrors = result?.globalErrors ?? [];
  if (totalErrors(counts) > 0 || globalErrors.length > 0) return true;
  return status === 0;
}

export function hasUnparseableTscFailure({ status, counts, globalErrors }) {
  return !compilerRunHasParseableDiagnostics({ status, counts, globalErrors });
}

export function describeUnusableCompilerRun({
  status,
  output,
  prefix = 'scripts-typecheck',
}) {
  const renderedOutput =
    String(output ?? '').trim() === ''
      ? 'Compiler produced no output.'
      : `Compiler output:\n${output}`;
  return (
    `[${prefix}] FAIL — compiler exited ${status ?? 1} without parseable TypeScript diagnostics.\n` +
    'Refusing to write or shrink the baseline; a missing or crashed compiler would publish a false zero-error baseline.\n' +
    renderedOutput
  );
}

/** @param {ErrorCounts} counts */
export function toBaselineJson(counts, extra = {}) {
  /** @type {Record<string, Record<string, number>>} */
  const files = {};
  for (const file of [...counts.keys()].sort()) {
    const byCode = counts.get(file);
    files[file] = {};
    for (const code of [...byCode.keys()].sort()) {
      files[file][code] = byCode.get(code);
    }
  }
  return {
    schemaVersion: BASELINE_SCHEMA_VERSION,
    tool: extra.tool ?? 'scripts/typecheck-scripts.mjs',
    generatedAt: new Date().toISOString(),
    totalErrors: totalErrors(counts),
    files,
    ...Object.fromEntries(
      Object.entries(extra).filter(([key]) => key !== 'tool')
    ),
  };
}

function baselinePath() {
  return process.env.SCRIPTS_TYPECHECK_BASELINE_PATH
    ? resolve(process.env.SCRIPTS_TYPECHECK_BASELINE_PATH)
    : DEFAULT_BASELINE_PATH;
}

function tsconfigPath() {
  return process.env.SCRIPTS_TYPECHECK_TSCONFIG_PATH
    ? resolve(process.env.SCRIPTS_TYPECHECK_TSCONFIG_PATH)
    : DEFAULT_TSCONFIG_PATH;
}

export function runTscProject({
  tsconfig,
  extraArgs = [],
  env = process.env,
  prefix = 'scripts-typecheck',
  tscEntrypoint = resolve(REPO_ROOT, 'node_modules/typescript/bin/tsc'),
}) {
  if (!existsSync(tscEntrypoint)) {
    return {
      status: 1,
      output:
        `[${prefix}] Cannot find ${tscEntrypoint}.\n` +
        'Remediation: run `pnpm install` at the repo root (typescript is a root devDependency).\n',
    };
  }
  const result = spawnSync(
    process.execPath,
    [tscEntrypoint, '-p', tsconfig, '--pretty', 'false', ...extraArgs],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env,
      maxBuffer: 50 * 1024 * 1024,
    }
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.error) {
    return { status: 1, output: `${output}${result.error.message}\n` };
  }
  return { status: result.status ?? 1, output };
}

function loadBaselineFile(path, prefix, updateCommand) {
  if (!existsSync(path)) {
    console.error(`[${prefix}] Baseline not found: ${path}`);
    console.error(`Remediation: generate it with \`${updateCommand}\`.`);
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (parsed?.schemaVersion !== BASELINE_SCHEMA_VERSION) {
    console.error(
      `[${prefix}] Baseline schemaVersion must be ${BASELINE_SCHEMA_VERSION}; got ${parsed?.schemaVersion}`
    );
    process.exit(1);
  }
  return parsed;
}

export function evaluateTypecheckBaseline({
  prefix,
  baselineFile,
  tsconfig,
  extraArgs = [],
  extraBaselineFields = {},
  pretty = true,
  updateCommand,
  updateMode = process.argv.includes('--update-baseline'),
  env = process.env,
  tool,
  tscEntrypoint = undefined,
  runTsc = runTscProject,
  exit = code => process.exit(code),
  nodeVersion = process.version,
}) {
  if (!isSupportedTypecheckNode(nodeVersion)) {
    console.error(
      `[${prefix}] FAIL — refusing to typecheck or write the baseline on Node ${nodeVersion}; a real Node 22 compiler run is required.`
    );
    exit(1);
    return;
  }

  const { status, output } = runTsc({
    tsconfig,
    extraArgs,
    env,
    prefix,
    tscEntrypoint,
  });
  const { counts, globalErrors, lines } = parseTscOutput(output);

  if (globalErrors.length > 0) {
    console.error(
      `[${prefix}] FAIL — tsc reported config-level errors; the check itself is broken.`
    );
    for (const line of globalErrors) console.error(`  ${line}`);
    exit(1);
    return;
  }

  if (!compilerRunHasParseableDiagnostics({ status, counts, globalErrors })) {
    console.error(describeUnusableCompilerRun({ status, output, prefix }));
    exit(1);
    return;
  }

  if (updateMode) {
    const baseline = toBaselineJson(counts, {
      tool: tool ?? `scripts/${prefix}.mjs`,
      ...extraBaselineFields,
    });
    writeFileSync(
      baselineFile,
      pretty
        ? `${JSON.stringify(baseline, null, 2)}\n`
        : `${JSON.stringify(baseline)}\n`
    );
    console.log(
      `[${prefix}] baseline updated → ${baselineFile} ` +
        `(${baseline.totalErrors} errors across ${Object.keys(baseline.files).length} files)`
    );
    exit(0);
    return;
  }

  const baseline = loadBaselineFile(baselineFile, prefix, updateCommand);
  const { ok, newErrors, staleEntries } = compareWithBaseline(counts, baseline);

  if (ok) {
    console.log(
      `[${prefix}] PASS — ${totalErrors(counts)} pre-existing errors match the baseline ` +
        `(${baseline.totalErrors} baselined); no new errors.`
    );
    exit(0);
    return;
  }

  if (newErrors.length > 0) {
    console.error(
      `[${prefix}] FAIL — ${newErrors.length} (file, error-code) group(s) exceed the baseline.`
    );
    for (const { file, code, count, baseline: base } of newErrors) {
      console.error(`  ${file}: ${code} ×${count} (baseline ×${base})`);
      for (const line of lines.get(`${file}::${code}`) ?? []) {
        console.error(`    ${line}`);
      }
    }
    console.error(
      'Fix the new errors. If one is genuinely pre-existing, regenerate the ' +
        `baseline with \`${updateCommand}\` (visible in PR diff).`
    );
  }
  if (staleEntries.length > 0) {
    console.error(
      `[${prefix}] FAIL — baseline is stale: ${staleEntries.length} (file, error-code) group(s) no longer produce the baselined errors.`
    );
    for (const { file, code, count, baseline: base } of staleEntries) {
      console.error(`  ${file}: ${code} ×${count} (baseline ×${base})`);
    }
    console.error(
      `The baseline is shrink-only: regenerate it with \`${updateCommand}\` ` +
        'in the same PR that removes the errors.'
    );
  }
  exit(1);
}

function main() {
  evaluateTypecheckBaseline({
    prefix: 'scripts-typecheck',
    baselineFile: baselinePath(),
    tsconfig: tsconfigPath(),
    extraArgs: [],
    pretty: true,
    updateCommand: 'pnpm run typecheck:scripts:update',
    tool: 'scripts/typecheck-scripts.mjs',
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
