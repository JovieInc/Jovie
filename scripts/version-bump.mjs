#!/usr/bin/env node

/**
 * Version bump script with automatic changelog rotation.
 *
 * Usage:
 *   node scripts/version-bump.mjs patch   # 0.1.0 → 0.1.1
 *   node scripts/version-bump.mjs minor   # 0.1.0 → 0.2.0
 *   node scripts/version-bump.mjs major   # 0.1.0 → 1.0.0
 *
 * What it does:
 *   1. Bumps the version in version.json (single source of truth)
 *   2. Syncs the version into root package.json and apps/web/package.json
 *   3. Rotates the [Unreleased] section in CHANGELOG.md into a dated release
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BUMP_TYPE = process.argv[2];
if (!['patch', 'minor', 'major'].includes(BUMP_TYPE)) {
  console.error('Usage: node scripts/version-bump.mjs <patch|minor|major>');
  process.exit(1);
}

// --- 1. Read current version ---
const versionFile = join(ROOT, 'version.json');
const { version: current } = JSON.parse(readFileSync(versionFile, 'utf-8'));
const [major, minor, patch] = current.split('.').map(Number);

// --- 2. Compute next version ---
let next;
switch (BUMP_TYPE) {
  case 'major':
    next = `${major + 1}.0.0`;
    break;
  case 'minor':
    next = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    next = `${major}.${minor}.${patch + 1}`;
    break;
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

const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const releaseHeading = `## [${next}] - ${today}`;

// Replace the [Unreleased] heading, keeping its content but adding a new
// empty [Unreleased] section above the newly-dated release.
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
