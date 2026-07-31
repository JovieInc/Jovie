#!/usr/bin/env node
/**
 * Hard component ship gate (JOV-4421).
 *
 * Fail closed when a shippable UI component is added/changed without:
 *   1. Matching unit/interaction test (colocated or verified @coverage-via)
 *   2. Matching Storybook story that imports the real component
 *   3. Static match checks (required props / state matrix hints)
 *   4. Story quality hygiene (no pure-black voids / fake CTAs)
 *   5. Multi-root story-coverage ratchet (lock_up + no uncovered growth)
 *
 * Usage:
 *   pnpm component-ship-gate
 *   node scripts/component-ship-gate.mjs [--diff-base=origin/main] [--skip-quality] [--skip-ratchet]
 *
 * Env:
 *   COMPONENT_SHIP_DIFF_BASE / STORY_COVERAGE_DIFF_BASE / TURBO_SCM_BASE / GITHUB_BASE_REF
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkStoryMatchesComponent,
  isUnderShipScope,
  normalizeRepoPath,
  parseCoverageVia,
  REPO_ROOT,
  readText,
  resolveCoverageViaPath,
  verifyCoverageVia,
} from './component-ship-policy.mjs';
import {
  compareCoverage,
  loadBaseline,
  measureAllRoots,
} from './story-coverage-ratchet.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const flags = {
    diffBase: null,
    skipQuality: false,
    skipRatchet: false,
    json: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--diff-base='))
      flags.diffBase = arg.slice('--diff-base='.length);
    else if (arg === '--skip-quality') flags.skipQuality = true;
    else if (arg === '--skip-ratchet') flags.skipRatchet = true;
    else if (arg === '--json') flags.json = true;
    else if (arg === '--help' || arg === '-h') flags.help = true;
  }
  return flags;
}

function resolveDiffBase(explicit) {
  if (explicit) return explicit;
  if (process.env.COMPONENT_SHIP_DIFF_BASE) {
    return process.env.COMPONENT_SHIP_DIFF_BASE;
  }
  if (process.env.STORY_COVERAGE_DIFF_BASE) {
    return process.env.STORY_COVERAGE_DIFF_BASE;
  }
  if (process.env.TURBO_SCM_BASE) return process.env.TURBO_SCM_BASE;
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  // Local default: compare against main when available.
  const probe = spawnSync('git', ['rev-parse', '--verify', 'origin/main'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (probe.status === 0) return 'origin/main';
  return null;
}

function changedFiles(diffBase) {
  if (!diffBase) return [];
  const result = spawnSync(
    'git',
    ['diff', '--diff-filter=ACMR', '--name-only', `${diffBase}...HEAD`],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
  if (result.status !== 0) {
    throw new Error(
      `could not resolve changed files from ${diffBase}: ${result.stderr?.trim() || result.stdout}`
    );
  }
  return result.stdout
    .split('\n')
    .map(l => normalizeRepoPath(l.trim()))
    .filter(Boolean);
}

function findAdjacentArtifacts(sourceRel) {
  const dir = dirname(sourceRel);
  const base = sourceRel
    .split('/')
    .pop()
    .replace(/\.tsx$/i, '');
  const storyCandidates = [
    `${dir}/${base}.stories.tsx`,
    `${dir}/${base}.stories.ts`,
    `${dir}/${base[0]?.toUpperCase()}${base.slice(1)}.stories.tsx`,
  ];
  const testCandidates = [
    `${dir}/${base}.test.tsx`,
    `${dir}/${base}.test.ts`,
    `${dir}/${base}.spec.tsx`,
    `${dir}/${base}.spec.ts`,
  ];
  const storyRel =
    storyCandidates.find(p => existsSync(join(REPO_ROOT, p))) ?? null;
  const testRel =
    testCandidates.find(p => existsSync(join(REPO_ROOT, p))) ?? null;
  return { storyRel, testRel, base };
}

/**
 * Diff gate for changed component sources.
 */
export function checkChangedComponents(changed, { repoRoot = REPO_ROOT } = {}) {
  const issues = [];
  const componentSources = changed.filter(isUnderShipScope);

  for (const sourceRel of componentSources) {
    const { storyRel, testRel, base } = findAdjacentArtifacts(sourceRel);
    let componentSource;
    try {
      componentSource = readText(sourceRel, repoRoot);
    } catch {
      issues.push({
        path: sourceRel,
        rule: 'source-unreadable',
        detail: 'changed component source is unreadable',
      });
      continue;
    }

    // --- Test requirement ---
    const via = parseCoverageVia(componentSource);
    let testOk = Boolean(testRel);
    let resolvedTest = testRel;

    if (!testOk && via) {
      const viaRel = resolveCoverageViaPath(via, sourceRel, repoRoot);
      const verified = verifyCoverageVia({
        viaRel,
        componentRel: sourceRel,
        componentBase: base,
        repoRoot,
      });
      if (verified.ok) {
        testOk = true;
        resolvedTest = viaRel;
      } else {
        issues.push({
          path: sourceRel,
          rule: 'coverage-via-invalid',
          detail: verified.detail,
        });
      }
    }

    if (!testOk) {
      issues.push({
        path: sourceRel,
        rule: 'missing-test',
        detail: `No colocated ${base}.test.tsx (or .spec) and no valid // @coverage-via directive`,
      });
    } else if (resolvedTest && !changed.includes(resolvedTest)) {
      // Behavior/API changes must update the test in the same PR.
      issues.push({
        path: sourceRel,
        rule: 'test-not-touched',
        detail: `Component changed but test ${resolvedTest} was not touched in this diff. Update the test (or include it in the PR).`,
      });
    }

    // --- Story presence ---
    if (!storyRel) {
      issues.push({
        path: sourceRel,
        rule: 'missing-story',
        detail: `No adjacent ${base}.stories.tsx`,
      });
      continue;
    }

    // --- Match checks ---
    let storySource;
    try {
      storySource = readText(storyRel, repoRoot);
    } catch {
      issues.push({
        path: storyRel,
        rule: 'story-unreadable',
        detail: 'story file exists but is unreadable',
      });
      continue;
    }

    const match = checkStoryMatchesComponent({
      componentSource,
      storySource,
      componentRel: sourceRel,
      storyRel,
    });
    for (const finding of match.findings) {
      issues.push({
        path: sourceRel,
        rule: finding.rule,
        detail: finding.detail,
      });
    }
  }

  return {
    ok: issues.length === 0,
    applicable: componentSources.length > 0,
    changedComponents: componentSources,
    issues,
  };
}

function runStoryQuality() {
  const script = join(__dirname, 'storybook-story-quality-guard.mjs');
  const result = spawnSync(process.execPath, [script], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return {
    ok: result.status === 0,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    status: result.status ?? 1,
  };
}

function runRatchet() {
  const measurement = measureAllRoots();
  const baseline = loadBaseline();
  const comparison = compareCoverage(measurement, baseline);
  return { ok: comparison.ok, comparison, measurement };
}

export function runComponentShipGate(options = {}) {
  const flags = {
    diffBase: options.diffBase ?? resolveDiffBase(null),
    skipQuality: options.skipQuality ?? false,
    skipRatchet: options.skipRatchet ?? false,
  };

  const report = {
    schemaVersion: 1,
    gate: 'component-ship-gate',
    diffBase: flags.diffBase,
    sections: {},
    ok: true,
  };

  // 1) Diff gate (skip when no base — still run ratchet/quality)
  if (flags.diffBase) {
    const changed = changedFiles(flags.diffBase);
    const diff = checkChangedComponents(changed);
    report.sections.diff = diff;
    if (!diff.ok) report.ok = false;
  } else {
    report.sections.diff = {
      ok: true,
      applicable: false,
      changedComponents: [],
      issues: [],
      note: 'no diff base; skipped changed-component checks',
    };
  }

  // 2) Story quality
  if (!flags.skipQuality) {
    const quality = runStoryQuality();
    report.sections.quality = {
      ok: quality.ok,
      output: quality.output.trim().slice(0, 2000),
    };
    if (!quality.ok) report.ok = false;
  } else {
    report.sections.quality = { ok: true, skipped: true };
  }

  // 3) Multi-root ratchet
  if (!flags.skipRatchet) {
    try {
      const ratchet = runRatchet();
      report.sections.ratchet = {
        ok: ratchet.ok,
        message: ratchet.comparison.message,
        roots: (ratchet.comparison.roots ?? []).map(r => ({
          root: r.root,
          ok: r.ok,
          message: r.message,
        })),
      };
      if (!ratchet.ok) report.ok = false;
    } catch (error) {
      report.sections.ratchet = {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
      report.ok = false;
    }
  } else {
    report.sections.ratchet = { ok: true, skipped: true };
  }

  return report;
}

function printReport(report) {
  console.log(`[component-ship-gate] diffBase=${report.diffBase ?? '(none)'}`);

  const diff = report.sections.diff;
  if (diff?.applicable) {
    console.log(
      `[component-ship-gate] changed components: ${diff.changedComponents.length}`
    );
    for (const issue of diff.issues ?? []) {
      console.error(
        `::error file=${issue.path}::[${issue.rule}] ${issue.detail}`
      );
      console.error(`- ${issue.path}: [${issue.rule}] ${issue.detail}`);
    }
    if (diff.ok) {
      console.log('[component-ship-gate] diff: ok');
    }
  } else {
    console.log(
      `[component-ship-gate] diff: ${diff?.note ?? 'no in-scope component sources changed'}`
    );
  }

  const quality = report.sections.quality;
  if (quality?.skipped) {
    console.log('[component-ship-gate] quality: skipped');
  } else if (quality?.ok) {
    console.log(`[component-ship-gate] quality: ${quality.output || 'ok'}`);
  } else {
    console.error('[component-ship-gate] quality: FAIL');
    if (quality?.output) console.error(quality.output);
  }

  const ratchet = report.sections.ratchet;
  if (ratchet?.skipped) {
    console.log('[component-ship-gate] ratchet: skipped');
  } else if (ratchet?.ok) {
    for (const root of ratchet.roots ?? []) {
      console.log(`  ${root.message}`);
    }
    console.log('[component-ship-gate] ratchet: ok');
  } else {
    console.error('[component-ship-gate] ratchet: FAIL');
    console.error(ratchet?.message ?? 'unknown ratchet failure');
    for (const root of ratchet.roots ?? []) {
      if (!root.ok) console.error(`  ${root.message}`);
    }
  }

  if (report.ok) {
    console.log('[component-ship-gate] PASS');
  } else {
    console.error(
      '[component-ship-gate] FAIL — shippable UI components require matching tests + stories (JOV-4421)'
    );
  }
}

function main(argv = process.argv.slice(2)) {
  const flags = parseArgs(argv);
  if (flags.help) {
    console.log(`Usage: node scripts/component-ship-gate.mjs [options]
  --diff-base=<ref>   Git base for changed-file detection (default: origin/main)
  --skip-quality      Skip storybook quality guard
  --skip-ratchet      Skip multi-root story coverage ratchet
  --json              Print machine-readable report`);
    return 0;
  }

  const report = runComponentShipGate({
    diffBase: flags.diffBase ?? resolveDiffBase(null),
    skipQuality: flags.skipQuality,
    skipRatchet: flags.skipRatchet,
  });

  if (flags.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }
  return report.ok ? 0 : 1;
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(
      `::error::${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(2);
  }
}
