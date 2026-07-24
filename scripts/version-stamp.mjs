#!/usr/bin/env node

/**
 * Version stamp (MAIN-ONLY / release path).
 *
 * Computes the next CalVer (`YY.M.PATCH`) and writes it consistently across the
 * version fan-out:
 *   - version.json
 *   - VERSION
 *   - the `version` field of root + workspace package.json files
 *   - promotes the `## [Unreleased]` CHANGELOG section to a dated release heading
 *     and re-opens a fresh empty `## [Unreleased]` section
 *
 * This is the ONLY supported way to bump the version. Feature branches must not
 * touch these files (enforced by `scripts/version-fanout-guard.mjs`). Run this
 * after merge to main, or from the release workflow. See `.claude/rules/release.md`.
 *
 * Usage:
 *   node scripts/version-stamp.mjs            # bump + write fan-out
 *   node scripts/version-stamp.mjs --dry-run  # print the plan, write nothing
 *   node scripts/version-stamp.mjs --set 26.7.0  # stamp an explicit version
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VERSION_PATTERN = /^(\d{2})\.(1[0-2]|[1-9])\.(\d+)$/;

/**
 * Compute the next CalVer from the current version and the current date.
 * - Same calendar month → increment PATCH.
 * - New calendar month → reset PATCH to 0.
 *
 * @param {string} currentVersion - e.g. "26.6.61"
 * @param {Date} now - reference date (UTC fields are used)
 * @returns {string} next version, e.g. "26.6.62" or "26.7.0"
 */
export function computeNextVersion(currentVersion, now = new Date()) {
  const parsed = currentVersion.match(VERSION_PATTERN);
  if (!parsed) {
    throw new Error(
      `Current version "${currentVersion}" is not valid YY.M.PATCH.`
    );
  }
  const curYear = Number(parsed[1]);
  const curMonth = Number(parsed[2]);
  const curPatch = Number(parsed[3]);

  const yy = now.getUTCFullYear() % 100;
  const mm = now.getUTCMonth() + 1;

  if (yy === curYear && mm === curMonth) {
    return `${yy}.${mm}.${curPatch + 1}`;
  }
  return `${yy}.${mm}.0`;
}

/** Discover root + workspace package.json files that carry a version field. */
export function discoverVersionedManifests(root = ROOT) {
  const manifests = ['package.json'];
  for (const scope of ['apps', 'packages']) {
    const scopeDir = join(root, scope);
    if (!existsSync(scopeDir)) {
      continue;
    }
    for (const entry of readdirSync(scopeDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const rel = `${scope}/${entry.name}/package.json`;
      const abs = join(root, rel);
      if (existsSync(abs)) {
        try {
          const content = readFileSync(abs, 'utf-8');
          if (/^(\s*)"version":\s*"/m.test(content)) {
            manifests.push(rel);
          }
        } catch {
          // unreadable or malformed — skip
        }
      }
    }
  }
  return manifests.sort();
}

/** Replace the top-level `"version": "..."` field, preserving formatting. */
export function setManifestVersion(source, nextVersion) {
  let replaced = false;
  const out = source.replace(
    /^(\s*)"version":\s*"[^"]*"/m,
    (_match, indent) => {
      replaced = true;
      return `${indent}"version": "${nextVersion}"`;
    }
  );
  if (!replaced) {
    throw new Error('Could not find a top-level "version" field.');
  }
  return out;
}

/**
 * Promote `## [Unreleased]` to the newest dated release heading and reopen a
 * fresh empty Unreleased section at the top of the release list.
 *
 * CHANGELOG.md normally has: preamble, latest dated release, then Unreleased.
 * `version:check` reads the FIRST dated release as latest, so this function must
 * move Unreleased notes above older releases when it stamps them.
 *
 * If no Unreleased section exists, insert an empty dated release after the
 * preamble so the fan-out remains consistent.
 *
 * @param {string} changelog
 * @param {string} nextVersion
 * @param {string} dateISO - YYYY-MM-DD
 * @returns {string}
 */
export function promoteChangelog(changelog, nextVersion, dateISO) {
  const dated = `## [${nextVersion}] - ${dateISO}`;
  const freshUnreleased = '## [Unreleased]';
  const lines = changelog.split('\n');

  const firstReleaseIndex = lines.findIndex(line => /^##\s/.test(line));
  const insertAt = firstReleaseIndex === -1 ? lines.length : firstReleaseIndex;
  const unreleasedIndex = lines.findIndex(line =>
    /^##\s*\[Unreleased\]\s*$/.test(line)
  );

  if (unreleasedIndex === -1) {
    const nextLines = [...lines];
    nextLines.splice(insertAt, 0, freshUnreleased, '', dated, '');
    return nextLines.join('\n');
  }

  let unreleasedEnd = lines.length;
  for (let i = unreleasedIndex + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      unreleasedEnd = i;
      break;
    }
  }

  const unreleasedBody = lines.slice(unreleasedIndex + 1, unreleasedEnd);
  const withoutUnreleased = [
    ...lines.slice(0, unreleasedIndex),
    ...lines.slice(unreleasedEnd),
  ];

  const nextFirstReleaseIndex = withoutUnreleased.findIndex(line =>
    /^##\s/.test(line)
  );
  const nextInsertAt =
    nextFirstReleaseIndex === -1
      ? withoutUnreleased.length
      : nextFirstReleaseIndex;

  withoutUnreleased.splice(
    nextInsertAt,
    0,
    freshUnreleased,
    '',
    dated,
    ...unreleasedBody
  );

  return withoutUnreleased.join('\n');
}

/**
 * Pure planner: given current state, produce the set of file writes required.
 *
 * @param {object} input
 * @param {string} input.currentVersion
 * @param {string} input.nextVersion
 * @param {Array<{ path: string, content: string }>} input.manifests
 * @param {string} input.versionFile - current VERSION file content
 * @param {string} input.changelog - current CHANGELOG.md content
 * @param {string} input.dateISO
 * @returns {Array<{ path: string, content: string }>}
 */
export function planStamp({ nextVersion, manifests, changelog, dateISO }) {
  const writes = [];

  writes.push({
    path: 'version.json',
    content: `${JSON.stringify({ version: nextVersion }, null, 2)}\n`,
  });
  writes.push({ path: 'VERSION', content: `${nextVersion}\n` });

  for (const manifest of manifests) {
    writes.push({
      path: manifest.path,
      content: setManifestVersion(manifest.content, nextVersion),
    });
  }

  writes.push({
    path: 'CHANGELOG.md',
    content: promoteChangelog(changelog, nextVersion, dateISO),
  });

  return writes;
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return null;
  }
  return process.argv[index + 1] || null;
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const explicit = getArgValue('--set');

  const versionJsonPath = join(ROOT, 'version.json');
  const currentVersion = JSON.parse(
    readFileSync(versionJsonPath, 'utf-8')
  ).version;

  const now = new Date();
  const nextVersion = explicit ?? computeNextVersion(currentVersion, now);

  if (!VERSION_PATTERN.test(nextVersion)) {
    console.error(
      `[version-stamp] Refusing to stamp invalid version "${nextVersion}".`
    );
    process.exit(1);
  }

  const dateISO = now.toISOString().slice(0, 10);

  const manifestPaths = discoverVersionedManifests();
  const manifests = manifestPaths.map(rel => ({
    path: rel,
    content: readFileSync(join(ROOT, rel), 'utf-8'),
  }));

  const writes = planStamp({
    currentVersion,
    nextVersion,
    manifests,
    versionFile: readFileSync(join(ROOT, 'VERSION'), 'utf-8'),
    changelog: readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf-8'),
    dateISO,
  });

  console.log(
    `[version-stamp] ${currentVersion} → ${nextVersion} (${dateISO})`
  );

  if (dryRun) {
    console.log('[version-stamp] --dry-run: no files written. Planned writes:');
    for (const write of writes) {
      console.log(`- ${write.path}`);
    }
    return;
  }

  for (const write of writes) {
    writeFileSync(join(ROOT, write.path), write.content);
    console.log(`[version-stamp] wrote ${write.path}`);
  }

  console.log(
    '[version-stamp] Done. Run `node scripts/version-check.mjs` to validate.'
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
