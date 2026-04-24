#!/usr/bin/env node

/**
 * Versioning integrity audit.
 * Validates:
 * - CalVer aligns with current UTC calendar month/year
 * - All package versions match version.json
 * - CHANGELOG latest release equals current version
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VERSION_PATTERN = /^(\d{2})\.(1[0-2]|[1-9])\.(\d+)$/;

const errors = [];

const currentVersion = JSON.parse(
  readFileSync(join(ROOT, 'version.json'), 'utf-8')
).version;
const parsed = currentVersion.match(VERSION_PATTERN);
if (!parsed) {
  errors.push(
    `version.json version "${currentVersion}" is not valid YY.M.PATCH.`
  );
} else {
  const year = Number(parsed[1]);
  const month = Number(parsed[2]);
  const now = new Date();
  const yy = now.getUTCFullYear() % 100;
  const mm = now.getUTCMonth() + 1;

  if (year !== yy || month !== mm) {
    errors.push(
      `version.json (${currentVersion}) does not match current UTC calendar (${yy}.${mm}.x).`
    );
  }
}

const workspacePackageJsons = ['apps', 'packages']
  .flatMap(scope =>
    readdirSync(join(ROOT, scope), { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => `${scope}/${entry.name}/package.json`)
      .filter(rel => existsSync(join(ROOT, rel)))
  )
  .sort();

for (const rel of ['package.json', ...workspacePackageJsons]) {
  const version = JSON.parse(readFileSync(join(ROOT, rel), 'utf-8')).version;
  if (version !== currentVersion) {
    errors.push(
      `${rel} version (${version}) does not match version.json (${currentVersion}).`
    );
  }
}

const versionFile = readFileSync(join(ROOT, 'VERSION'), 'utf-8').trim();
if (versionFile !== currentVersion) {
  errors.push(
    `VERSION (${versionFile}) does not match version.json (${currentVersion}).`
  );
}

const changelog = readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf-8');

const releaseMatches = [
  ...changelog.matchAll(
    /^## \[(\d{2}\.(?:1[0-2]|[1-9])\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm
  ),
];
if (releaseMatches.length === 0) {
  errors.push('CHANGELOG.md has no released versions.');
} else {
  const latestReleased = releaseMatches[0][1];
  if (latestReleased !== currentVersion) {
    errors.push(
      `Latest CHANGELOG release (${latestReleased}) does not match version.json (${currentVersion}).`
    );
  }
}

if (errors.length > 0) {
  console.error('Versioning audit failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Versioning audit passed.');
