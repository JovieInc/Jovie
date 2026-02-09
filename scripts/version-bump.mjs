#!/usr/bin/env node

/**
 * CalVer version bump with automatic changelog rotation.
 *
 * Format: YY.M.patch  (e.g. 26.2.0, 26.2.1, 26.3.0)
 *   - YY.M auto-derives from the current date
 *   - patch is a sequential counter within the month, resets on new month
 *
 * Usage:
 *   pnpm version:bump          # 26.2.0 → 26.2.1 (same month)
 *                               # 26.1.5 → 26.2.0 (new month)
 *
 * What it does:
 *   1. Reads the current version from version.json
 *   2. Computes next version based on the current calendar month
 *   3. Writes version.json, syncs package.json files
 *   4. Rotates the [Unreleased] section in CHANGELOG.md into a dated release
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- 1. Read current version ---
const versionFile = join(ROOT, 'version.json');
const { version: current } = JSON.parse(readFileSync(versionFile, 'utf-8'));
const [curYear, curMonth, curPatch] = current.split('.').map(Number);

// --- 2. Compute next calver ---
const now = new Date();
const yy = now.getFullYear() % 100; // 2026 → 26
const mm = now.getMonth() + 1;       // 1-12

let next;
if (yy === curYear && mm === curMonth) {
  // Same month → increment patch
  next = `${yy}.${mm}.${curPatch + 1}`;
} else {
  // New month (or year) → reset patch to 0
  next = `${yy}.${mm}.0`;
}

// --- 3. Write version.json ---
writeFileSync(versionFile, JSON.stringify({ version: next }, null, 2) + '\n');

// --- 4. Sync package.json files ---
for (const rel of ['package.json', 'apps/web/package.json']) {
  const pkgPath = join(ROOT, rel);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.version = next;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

// --- 5. Rotate CHANGELOG.md ---
const changelogPath = join(ROOT, 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf-8');

const today = now.toISOString().slice(0, 10); // YYYY-MM-DD
const releaseHeading = `## [${next}] - ${today}`;

const updatedChangelog = changelog.replace(
  /^## \[Unreleased\]/m,
  `## [Unreleased]\n\n${releaseHeading}`
);

writeFileSync(changelogPath, updatedChangelog);

console.log(`Bumped ${current} → ${next}`);
console.log(`  ✓ version.json`);
console.log(`  ✓ package.json (root)`);
console.log(`  ✓ apps/web/package.json`);
console.log(`  ✓ CHANGELOG.md (${releaseHeading})`);
