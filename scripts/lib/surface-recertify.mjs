// Automatic recertification of certified design surfaces (no off-repo store).
//
// A push to main that changes the bytes of a canonical census row's source or
// canonical owners without renewing that file's evidence entry makes the row
// stale, and design-surface-census.test.mjs then fails every PR (2026-10-29:
// #23600 changed a footer comment, main went red for hours). This module finds
// the stale files, validates freshly captured browser evidence, and writes one
// evidence entry per stale file with the census module's own `fileDigest`,
// never a hand-typed hash. Screenshots live in the workflow artifact of the
// capture run; the repo keeps only their sha256 digests and the artifact/run
// URL in each entry's `ref`, so no binary lands in the repo and no object-store
// credential is needed.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CENSUS_PATH,
  evidenceEntryPath,
  expandCensus,
  staleFiles,
} from '../design-surface-census.mjs';

export const REQUIRED_WIDTHS = [1440, 390];
const SHA256 = /^[0-9a-f]{64}$/;

export function readCensus(root) {
  return JSON.parse(readFileSync(join(root, CENSUS_PATH), 'utf8'));
}

/**
 * Canonical rows with at least one certified file whose bytes no longer match
 * its evidence entry, one entry per census group; `files` lists exactly the
 * stale files and their current sha256. `recertifiable` is false when the group cannot
 * be captured as one route (several sources, or a dynamic segment): those stay
 * red and the main-health alarm pages Summer instead of guessing.
 */
export function staleGroups(root, census = readCensus(root)) {
  const byGroup = new Map();
  for (const row of expandCensus(census)) {
    if (row.status !== 'canonical') continue;
    const stale = staleFiles(root, row);
    if (stale.length === 0) continue;
    const entry = byGroup.get(row.id) ?? {
      id: row.id,
      sources: [],
      route: row.route,
      files: [],
      reasons: [],
    };
    entry.sources.push(row.source);
    for (const { file, sha256 } of stale) {
      if (!entry.files.some(item => item.file === file))
        entry.files.push({ file, sha256 });
    }
    byGroup.set(row.id, entry);
  }
  return [...byGroup.values()].map(entry => {
    const reasons = [];
    if (entry.sources.length > 1)
      reasons.push('group has several sources; one capture cannot cover them');
    if (/[[\]]/.test(entry.route))
      reasons.push('dynamic route cannot be captured without a fixture');
    return { ...entry, reasons, recertifiable: reasons.length === 0 };
  });
}

/** Evidence the capture step wrote for one group; throws unless it proves a real render. */
/** Pathname of a census route, without query or trailing slash. */
export function routePath(route) {
  const path = new URL(route, 'http://local').pathname;
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

/** Routes behind sign-in need a test-auth session before capture. */
export function requiresAuth(route) {
  return /^\/app(\/|$)/.test(routePath(route));
}

export function validateCapture(capture, group) {
  const problems = [];
  if (capture?.id !== group.id) problems.push('capture is for another group');
  if (capture?.route !== group.route) problems.push('capture route mismatch');
  for (const width of REQUIRED_WIDTHS) {
    const shot = (capture?.shots ?? []).find(item => item.width === width);
    if (!shot) {
      problems.push(`missing ${width}px capture`);
      continue;
    }
    if (shot.status !== 200) problems.push(`${width}px HTTP ${shot.status}`);
    // A signed-out redirect (e.g. /app → /signin) answers 200 with the wrong
    // page; renewing on it certifies the sign-in screen as the app surface.
    if (shot.finalPath === undefined)
      problems.push(`${width}px final path not recorded`);
    else if (shot.finalPath !== routePath(group.route))
      problems.push(`${width}px redirected to ${shot.finalPath}`);
    if (shot.authStatus !== undefined && shot.authStatus !== 200)
      problems.push(`${width}px test sign-in HTTP ${shot.authStatus}`);
    if (!SHA256.test(shot.sha256 ?? ''))
      problems.push(`${width}px screenshot digest missing`);
    if (!(shot.bytes > 5000)) problems.push(`${width}px screenshot is empty`);
    if (shot.scrollWidth > shot.clientWidth)
      problems.push(
        `${width}px horizontal overflow (${shot.scrollWidth}>${shot.clientWidth})`
      );
    if (shot.pageErrors?.length)
      problems.push(`${width}px page errors: ${shot.pageErrors.join('; ')}`);
  }
  if (problems.length) throw new Error(`${group.id}: ${problems.join(', ')}`);
}

export function evidenceRef({ capture, group, runUrl, artifactName, sha }) {
  const shots = REQUIRED_WIDTHS.map(width => {
    const shot = capture.shots.find(item => item.width === width);
    return `${width}px sha256 ${shot.sha256}`;
  }).join(', ');
  return (
    `Automatic recertification after ${sha.slice(0, 9)} (surface-recertify bot). ` +
    `Rendered ${group.route} from a Next dev build of that commit in Chromium: HTTP 200, ` +
    `no horizontal overflow, no page errors. Full-page screenshots, ${shots}, are in workflow artifact ` +
    `${artifactName} of ${runUrl} (kept 90 days).`
  );
}

/** One `{ path, entry }` per stale file of the group, all citing the same `ref`. */
export function evidenceEntries(group, { at, ref }) {
  if (typeof ref !== 'string' || ref.trim().length < 20)
    throw new Error(
      `${group.id}: evidence ref must say what changed and how it was verified`
    );
  return group.files.map(({ file, sha256 }) => ({
    path: evidenceEntryPath(group.id, file),
    entry: { file, sha256, at, ref: ref.trim() },
  }));
}

/** Evidence entries for a group renewed from a validated browser capture. */
export function renewGroup(group, { capture, at, runUrl, artifactName, sha }) {
  validateCapture(capture, group);
  return evidenceEntries(group, {
    at,
    ref: evidenceRef({ capture, group, runUrl, artifactName, sha }),
  });
}
