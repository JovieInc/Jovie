#!/usr/bin/env node

/**
 * CalVer version bump with robust changelog rotation.
 *
 * Format: YY.M.PATCH (e.g. 26.2.0, 26.2.1, 26.3.0)
 * - YY.M derives from the current UTC calendar month
 * - PATCH increments within a month and resets on month change
 *
 * Usage:
 *   pnpm version:bump
 *   pnpm version:bump --allow-empty
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ALLOW_EMPTY = process.argv.includes('--allow-empty');
const VERSION_PATTERN = /^(\d{2})\.(1[0-2]|[1-9])\.(\d+)$/;

const versionFile = join(ROOT, 'version.json');
const current = JSON.parse(readFileSync(versionFile, 'utf-8')).version;
const parsedCurrent = current.match(VERSION_PATTERN);

if (!parsedCurrent) {
  throw new Error(`Invalid current version "${current}". Expected YY.M.PATCH.`);
}

const curYear = Number(parsedCurrent[1]);
const curMonth = Number(parsedCurrent[2]);
const curPatch = Number(parsedCurrent[3]);

const now = new Date();
const yy = now.getUTCFullYear() % 100;
const mm = now.getUTCMonth() + 1;
const today = now.toISOString().slice(0, 10);

if (curYear > yy || (curYear === yy && curMonth > mm)) {
  throw new Error(
    `Current version ${current} is ahead of the UTC calendar (${yy}.${mm}). Please correct version.json first.`
  );
}

const isSameMonth = yy === curYear && mm === curMonth;
const next = isSameMonth ? `${yy}.${mm}.${curPatch + 1}` : `${yy}.${mm}.0`;

const changelogPath = join(ROOT, 'CHANGELOG.md');
const changelog = readFileSync(changelogPath, 'utf-8');
const unreleasedMatch = changelog.match(
  /## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/
);

if (!unreleasedMatch) {
  throw new Error('CHANGELOG.md must contain a "## [Unreleased]" section.');
}

const unreleasedBody = unreleasedMatch[1].trim();
if (!ALLOW_EMPTY && unreleasedBody.length === 0) {
  throw new Error(
    'Refusing to bump version: [Unreleased] has no entries. Use --allow-empty to override.'
  );
}

const template = [
  '### Added',
  '',
  '- ',
  '',
  '### Changed',
  '',
  '- ',
  '',
  '### Fixed',
  '',
  '- ',
].join('\n');

const releaseHeading = `## [${next}] - ${today}`;
const releaseBlock = `${releaseHeading}\n\n${unreleasedBody}`.trimEnd();

const rotatedChangelog = changelog.replace(
  /## \[Unreleased\]\n([\s\S]*?)(?=\n## \[|$)/,
  `## [Unreleased]\n\n${template}\n\n${releaseBlock}\n`
);

writeFileSync(versionFile, JSON.stringify({ version: next }, null, 2) + '\n');

const packageJsonFiles = [
  'package.json',
  ...findPackageJsonFiles(join(ROOT, 'apps')),
  ...findPackageJsonFiles(join(ROOT, 'packages')),
];

for (const pkgRel of packageJsonFiles) {
  const pkgPath = join(ROOT, pkgRel);
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.version = next;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
}

writeFileSync(changelogPath, rotatedChangelog);

console.log(`Bumped ${current} → ${next}`);
console.log(`  ✓ version.json`);
for (const pkgRel of packageJsonFiles) {
  console.log(`  ✓ ${pkgRel}`);
}
console.log(`  ✓ CHANGELOG.md (${releaseHeading})`);

function findPackageJsonFiles(baseDir) {
  const results = [];

  try {
    for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packagePath = join(baseDir, entry.name, 'package.json');
      try {
        readFileSync(packagePath, 'utf-8');
        results.push(packagePath.replace(`${ROOT}/`, ''));
      } catch {
        continue;
      }
    }
  } catch {
    return [];
  }

  return results;
}
