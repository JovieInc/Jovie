#!/usr/bin/env node
// Says whether two commits install different dependencies, for
// lighthouse-build-baseline.sh. The baseline builds base in place on head's
// node_modules, so it must be skipped when the installs differ, and only then.
//
// Until 2026-11-11 the script skipped on any changed package.json. Of the 64
// dashboard gate runs that day, 4 had no baseline and fell back to absolute
// timing budgets; 2 of those changed only a version number or a package.json
// that pnpm never installs (scripts/security/deepsec), and one of them
// failed on runner noise (run 43008412182, /start TBT 354 against 350).
//
// The install differs when any of these differ between the two commits:
//   - pnpm-lock.yaml, pnpm-workspace.yaml, an .npmrc, .nvmrc, .node-version
//     or anything under patches/;
//   - the install fields of a package.json that is a workspace importer (a
//     key under `importers:` in either commit's pnpm-lock.yaml). Other fields
//     (version, scripts, exports) are read from the checked-out tree, so the
//     in-place base build sees base's own values.
// A package.json outside the workspace has its own install and is not built.
//
// Usage: node lighthouse-install-scope.mjs <base-sha> <head-sha>
// Prints `same`, or `changed <path>`. Exits non-zero only when it cannot
// tell, which the caller treats as changed.
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
import { pathToFileURL } from 'node:url';

const INSTALL_FILE =
  /(^|\/)(pnpm-lock\.yaml|pnpm-workspace\.yaml|\.npmrc|\.nvmrc|\.node-version)$|^patches\//;

export const INSTALL_FIELDS = Object.freeze([
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'dependenciesMeta',
  'bundleDependencies',
  'bundledDependencies',
  'overrides',
  'resolutions',
  'pnpm',
  'packageManager',
  'engines',
  'workspaces',
  'bin',
]);

/** Importer directories ('.' is the root) listed in a pnpm-lock.yaml. */
export function lockfileImporters(lockfile) {
  const importers = new Set();
  let inImporters = false;
  for (const line of (lockfile ?? '').split('\n')) {
    if (/^importers:\s*$/.test(line)) {
      inImporters = true;
      continue;
    }
    if (!inImporters) continue;
    if (/^\S/.test(line)) break;
    const match = /^ {2}(?:'([^']+)'|"([^"]+)"|([^\s'"][^:]*)):\s*$/.exec(line);
    if (match) importers.add(match[1] ?? match[2] ?? match[3]);
  }
  return importers;
}

function installFields(text) {
  if (text === null) return null;
  const manifest = JSON.parse(text);
  return JSON.stringify(
    INSTALL_FIELDS.map(field => [field, manifest[field] ?? null])
  );
}

/**
 * `read(sha, path)` returns the file's text at that commit, or null when it
 * does not exist there. Returns null when the installs match, otherwise the
 * first path that makes them differ.
 */
export function installChange({ changedPaths, read, base, head }) {
  const direct = changedPaths.find(file => INSTALL_FILE.test(file));
  if (direct) return direct;
  const importers = new Set([
    ...lockfileImporters(read(base, 'pnpm-lock.yaml')),
    ...lockfileImporters(read(head, 'pnpm-lock.yaml')),
  ]);
  for (const file of changedPaths) {
    if (posix.basename(file) !== 'package.json') continue;
    if (!importers.has(posix.dirname(file))) continue;
    if (installFields(read(base, file)) !== installFields(read(head, file))) {
      return file;
    }
  }
  return null;
}

function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function readAt(sha, file) {
  try {
    return git('show', `${sha}:${file}`);
  } catch {
    return null;
  }
}

function main([base, head]) {
  if (!base || !head) {
    console.error('usage: lighthouse-install-scope.mjs <base-sha> <head-sha>');
    process.exit(2);
  }
  const changedPaths = git('diff', '--name-only', '--no-renames', base, head)
    .split('\n')
    .filter(Boolean);
  const changed = installChange({ changedPaths, read: readAt, base, head });
  console.log(changed ? `changed ${changed}` : 'same');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2));
}
