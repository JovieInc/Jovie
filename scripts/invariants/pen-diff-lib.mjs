/**
 * Pure logic for the Pen-to-code merge gate (`pnpm design:pen-diff`).
 * Binding shape: jovie.pen-binding/v1 (docs/design-system/pen-bindings.json).
 * Thresholds and scope live in pen-diff.config.json only.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isEnforced,
  loadBindings,
  matchesAny,
  REPO_ROOT,
  routesForFiles,
} from '../design/pen-bindings-lib.mjs';
import { diffImage, resizeImage, ssim } from './pen-still-diff-lib.mjs';

// One reader: binding shape, globs, enforce and route selection come from
// scripts/design/pen-bindings-lib.mjs (W1).

export function stillPathsOf(entry) {
  return Object.values(entry.viewports ?? {}).flatMap(frames =>
    frames.map(f => f.still)
  );
}

/**
 * Decide which routes the PR must be checked against.
 * Returns toCheck (bound routes to render) and failures (policy failures that
 * need no render). `stillChangedAt` maps a still path changed in this PR to
 * its commit time (ISO).
 */
export function classifyRoutes({
  bindings,
  config,
  changedFiles,
  stillChangedAt = {},
}) {
  const ignore = config.ignoreSourceGlobs ?? [];
  const live = changedFiles.filter(f => !matchesAny(f, ignore));
  const sourceRoutes = new Set(
    routesForFiles(bindings, live).map(r => r.route)
  );
  const toCheck = [];
  const failures = [];
  const warnings = [];
  // Scope routes are the manifest's routes. `enforce: true` makes a route's
  // verdict blocking; otherwise it is reported and never fails the PR.
  for (const [route, entry] of Object.entries(bindings?.routes ?? {})) {
    const enforced = isEnforced(entry);
    const sourcesChanged = sourceRoutes.has(route);
    const stills = stillPathsOf(entry);
    const stillsChanged = changedFiles.filter(f => stills.includes(f));
    if (!sourcesChanged && stillsChanged.length === 0) continue;
    const report = message =>
      (enforced ? failures : warnings).push({ route, message, enforced });
    if (!entry.approved) {
      if (sourcesChanged)
        report(
          `no approved Pen design for ${route}${enforced ? '' : ' (not enforced)'}`
        );
      continue;
    }
    if (sourcesChanged && stillsChanged.length) {
      const approvedAt = Date.parse(entry.approved.at);
      for (const still of stillsChanged) {
        const changed = Date.parse(stillChangedAt[still] ?? '');
        if (!Number.isNaN(changed) && approvedAt <= changed)
          report(
            `${route}: approved.at ${entry.approved.at} is older than the still change to ${still} (${stillChangedAt[still]}); re-approve the design`
          );
      }
    }
    toCheck.push({ route, entry, enforced });
  }
  return { toCheck, failures, warnings };
}

/** Layout-box check: rendered aspect (h/w) within tolerance of the still's. */
export function boxCheck(still, box, tolerance) {
  const stillAspect = still.height / still.width;
  const boxAspect = box.height / box.width;
  const aspectError = Math.abs(boxAspect / stillAspect - 1);
  return {
    stillAspect,
    boxAspect,
    aspectError,
    pass: aspectError <= tolerance,
  };
}

/** Compare one cropped section render against its still. Pure. */
export function compareSection({ still, render, box }, thresholds) {
  const aligned = resizeImage(render, still.width, still.height);
  const score = ssim(still, aligned);
  const boxResult = boxCheck(
    still,
    box ?? { width: render.width, height: render.height },
    thresholds.boxAspectTolerance
  );
  const ssimPass = score >= thresholds.ssimMin;
  return {
    ssim: score,
    ssimPass,
    ssimMin: thresholds.ssimMin,
    box: boxResult,
    boxMax: thresholds.boxAspectTolerance,
    boxPass: boxResult.pass,
    pass: ssimPass && boxResult.pass,
    diff: diffImage(still, render),
  };
}

export function formatReport(results, failures, warnings = []) {
  const lines = [];
  for (const f of failures) lines.push(`FAIL ${f.message}`);
  for (const w of warnings) lines.push(`ADVISORY ${w.message}`);
  for (const r of results) {
    const box = r.box
      ? `aspect error ${r.box.aspectError.toFixed(3)} (max ${r.boxMax})`
      : 'box n/a';
    const score = r.ssim === undefined ? 'n/a' : r.ssim.toFixed(3);
    lines.push(
      `${r.pass ? 'PASS' : r.enforced === false ? 'ADVISORY-FAIL' : 'FAIL'} ${r.route} @${r.viewport} [${r.section}] ssim ${score} (min ${r.ssimMin}), ${box}${r.reason ? `, ${r.reason}` : ''}${r.diffPath ? `, diff ${r.diffPath}` : ''}`
    );
  }
  return lines.join('\n');
}

/**
 * Baseline self-adoption guard: Pen stills are never an adoption target, and
 * neither is a visual baseline for a route that has Pen stills. Returns a
 * reason string when `target` (repo-relative or absolute path) is protected.
 */
export function protectedBaselineReason(target, bindings, config) {
  const norm = target.replaceAll('\\', '/');
  if (/(^|\/)docs\/pen-stills\//.test(norm))
    return 'Pen stills are only changed by the approved Pen export, never by adoption';
  const name = norm.split('/').pop() ?? '';
  for (const [route, entry] of Object.entries(bindings?.routes ?? {})) {
    if (!entry || stillPathsOf(entry).length === 0) continue;
    const prefixes = config.baselinePrefixes?.[route] ?? [];
    if (prefixes.some(p => name === `${p}.png` || name.startsWith(`${p}-`)))
      return `route ${route} has Pen stills; its render must match the Pen still, not a new baseline`;
  }
  return null;
}

/**
 * Applies the self-adoption guard to an adoption plan ({copies, problems}):
 * protected copies become problems and are never written. `guard` is
 * {bindings, config}; it defaults to the repo's manifest and config.
 */
export function refuseProtected(plan, guard) {
  const g = guard ?? {
    bindings: existsSync(
      join(REPO_ROOT, 'docs/design-system/pen-bindings.json')
    )
      ? loadBindings(REPO_ROOT)
      : {},
    config: JSON.parse(
      readFileSync(
        join(REPO_ROOT, 'scripts/invariants/pen-diff.config.json'),
        'utf8'
      )
    ),
  };
  const copies = [];
  const problems = [...plan.problems];
  for (const copy of plan.copies) {
    const reason = protectedBaselineReason(copy.to, g.bindings, g.config);
    if (reason)
      problems.push(`refusing to adopt ${copy.to.split('/').pop()}: ${reason}`);
    else copies.push(copy);
  }
  return { copies, problems };
}
