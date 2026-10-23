/**
 * Blocking ICP-language check for homepage and general pages.
 *
 *   node scripts/invariants/icp-language/check.mjs
 *   node scripts/invariants/icp-language/check.mjs --write-baseline
 *
 * The baseline count can only shrink. --write-baseline records the live set;
 * it does not authorize a higher count once origin/main has a baseline.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_RELATIVE, loadConfig } from './match.mjs';
import { ancestorJson, evaluateRatchet } from './ratchet.mjs';
import { REPO_ROOT, scanIcpLanguage } from './scan.mjs';

export function readBaseline(repoRoot = REPO_ROOT) {
  const parsed = JSON.parse(
    readFileSync(join(repoRoot, BASELINE_RELATIVE), 'utf8')
  );
  if (!Array.isArray(parsed.ids) || typeof parsed.count !== 'number') {
    throw new Error(`${BASELINE_RELATIVE} must have count and ids`);
  }
  return parsed;
}

export function checkIcpLanguage(repoRoot = REPO_ROOT, options = {}) {
  const config = options.config ?? loadConfig();
  const scanned = scanIcpLanguage(repoRoot, config);
  const current = scanned.ids;
  /** @type {string[]} */
  const failures = [];
  let recorded = options.recorded;
  if (!recorded) {
    try {
      recorded = readBaseline(repoRoot);
    } catch (error) {
      return {
        failures: [error instanceof Error ? error.message : String(error)],
        ids: current,
        samples: scanned.samples,
        files: scanned.files,
      };
    }
  }
  if (recorded.count !== recorded.ids.length) {
    failures.push(
      `baseline count ${recorded.count} does not match ${recorded.ids.length} ids`
    );
  }
  const ancestor =
    options.ancestor ?? ancestorJson(repoRoot, BASELINE_RELATIVE);
  if (!ancestor.ok) {
    failures.push(ancestor.error);
  } else {
    const ancestorIds = ancestor.ancestor?.ids ?? null;
    failures.push(
      ...evaluateRatchet({
        current,
        recorded: recorded.ids,
        ancestor: ancestorIds,
      })
    );
  }
  return {
    failures,
    ids: current,
    count: current.length,
    samples: scanned.samples,
    files: scanned.files,
  };
}

function formatFailure(failure, samples) {
  return failure
    .split('\n')
    .map(line => {
      const id = line.trim().replace(/^[+-]\s+/u, '');
      const sample = samples?.get(id);
      return sample ? `${line}  ${sample}` : line;
    })
    .join('\n');
}

function writeBaseline(repoRoot, ids) {
  const body = {
    schema: 'jovie.icp-language-baseline/v1',
    count: ids.length,
    ids,
  };
  writeFileSync(
    join(repoRoot, BASELINE_RELATIVE),
    `${JSON.stringify(body, null, 2)}\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const scanned = scanIcpLanguage();
  if (process.argv.includes('--write-baseline')) {
    writeBaseline(REPO_ROOT, scanned.ids);
    process.stdout.write(
      `icp-language: wrote baseline count ${scanned.ids.length}\n`
    );
  }
  const result = checkIcpLanguage();
  if (result.failures.length > 0) {
    process.stderr.write(
      `${result.failures.map(failure => formatFailure(failure, result.samples)).join('\n\n')}\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `icp-language: ok (${result.count} baselined, shrink-only)\n`
    );
  }
}
