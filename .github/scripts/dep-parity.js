#!/usr/bin/env node

/**
 * Dependency Parity Digest
 *
 * Records a resolved-dependency digest for a CI run so merge_group runs can be
 * compared against the digests produced by the PR-head runs being merged.
 * Detects the "lockfile drifted between PR head and merge commit" class
 * (e.g. js-yaml resolving v5 on the merge group vs v4 on the PR head).
 *
 * Hash the lockfile and independently measure installed package manifests
 * through pnpm's workspace graph. A matching lockfile cannot hide a runner
 * loading a different installed version. Missing graph evidence fails closed.
 *
 * Usage:
 *   node dep-parity.js write   # writes dep-digest.json in cwd
 *   node dep-parity.js diff dep-digest.pr.json dep-digest.mg.json
 *                              # exits 1 listing differing packages
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// Measure the installed graph: identical lockfiles alone cannot prove that
// two runners actually loaded the same package versions.
function installedVersions(workspaces) {
  if (!Array.isArray(workspaces) || workspaces.length === 0)
    throw new Error('Missing installed workspace evidence');
  const versions = new Map();
  const visited = new Set();
  function visitPackage(packagePath) {
    const canonical = fs.realpathSync(packagePath);
    if (visited.has(canonical)) return;
    if (visited.size >= 10000)
      throw new Error('Installed graph exceeds evidence bound');
    visited.add(canonical);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(canonical, 'package.json'), 'utf8')
    );
    const privateWorkspace =
      manifest.private === true &&
      typeof manifest.name === 'string' &&
      manifest.name.startsWith('@jovie/') &&
      manifest.version === undefined;
    if (
      typeof manifest.name !== 'string' ||
      (!privateWorkspace &&
        (typeof manifest.version !== 'string' ||
          !/^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
            manifest.version
          )))
    )
      throw new Error(`Invalid installed package identity: ${manifest.name}`);
    // Versionless private workspace source belongs to the checked-out commit;
    // traverse its dependencies without inventing a package version.
    if (!privateWorkspace) {
      if (!versions.has(manifest.name)) versions.set(manifest.name, new Set());
      versions.get(manifest.name).add(manifest.version);
    }
    for (const name of new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    ])) {
      let directory = canonical;
      let found;
      while (true) {
        const candidate = path.join(directory, 'node_modules', name);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
          found = candidate;
          break;
        }
        const parent = path.dirname(directory);
        if (parent === directory) break;
        directory = parent;
      }
      if (found) visitPackage(found);
      else if (!(name in (manifest.optionalDependencies ?? {})))
        throw new Error(
          `Missing installed dependency: ${manifest.name} -> ${name}`
        );
    }
  }
  function visit(group) {
    if (!group || typeof group !== 'object' || Array.isArray(group))
      throw new Error('Invalid dependency evidence');
    for (const dependency of Object.values(group)) {
      if (
        !dependency ||
        typeof dependency !== 'object' ||
        typeof dependency.path !== 'string'
      )
        throw new Error('Missing installed dependency path');
      visitPackage(dependency.path);
      for (const key of [
        'dependencies',
        'devDependencies',
        'optionalDependencies',
      ]) {
        if (dependency[key]) visit(dependency[key]);
      }
    }
  }
  for (const workspace of workspaces) {
    for (const key of [
      'dependencies',
      'devDependencies',
      'optionalDependencies',
    ]) {
      if (workspace[key]) visit(workspace[key]);
    }
  }
  if (versions.size === 0) throw new Error('Empty installed dependency graph');
  return Object.fromEntries(
    [...versions]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, values]) => [name, [...values].sort()])
  );
}

/**
 * Extract resolved name->versions from pnpm-lock.yaml without a YAML parser.
 * Lockfile keys look like `  /@scope/name@1.2.3:` or `  name@1.2.3(peer):`.
 */
function extractResolvedVersions(lockfileText) {
  const resolved = {};
  const re = /^\s{2}['"]?\/?((?:@[\w.-]+\/)?[\w.-]+)@(\d[^\s:'"]*)/gm;
  let m;
  while ((m = re.exec(lockfileText)) !== null) {
    const [, name, version] = m;
    if (!/\d+\.\d+/.test(version)) continue;
    if (!resolved[name]) resolved[name] = new Set();
    resolved[name].add(version);
  }
  const out = {};
  for (const [name, versions] of Object.entries(resolved)) {
    out[name] = [...versions].sort();
  }
  return out;
}

function computeDigest({ exec = execFileSync } = {}) {
  const lockfilePath = path.join(process.cwd(), 'pnpm-lock.yaml');
  if (!fs.existsSync(lockfilePath)) {
    throw new Error('pnpm-lock.yaml not found');
  }
  const lockfileText = fs.readFileSync(lockfilePath, 'utf8');
  const lockfileSha = crypto
    .createHash('sha256')
    .update(lockfileText)
    .digest('hex');

  const resolved = installedVersions(
    JSON.parse(
      exec('pnpm', ['-r', 'list', '--depth=0', '--json'], {
        encoding: 'utf8',
        timeout: 60000,
        maxBuffer: 64 * 1024 * 1024,
      })
    )
  );
  const resolvedDigest = crypto
    .createHash('sha256')
    .update(JSON.stringify(resolved))
    .digest('hex');

  return {
    generatedAt: new Date().toISOString(),
    lockfileSha,
    resolvedDigest,
    resolved,
  };
}

function diffDigests(aPath, bPath) {
  const a = JSON.parse(fs.readFileSync(aPath, 'utf8'));
  const b = JSON.parse(fs.readFileSync(bPath, 'utf8'));
  const diffs = [];

  if (a.lockfileSha !== b.lockfileSha) {
    diffs.push(
      `lockfile sha differs: PR=${a.lockfileSha.slice(0, 12)} merge_group=${b.lockfileSha.slice(0, 12)}`
    );
  }

  const names = new Set([
    ...Object.keys(a.resolved || {}),
    ...Object.keys(b.resolved || {}),
  ]);
  for (const name of [...names].sort()) {
    const va = JSON.stringify((a.resolved || {})[name] ?? []);
    const vb = JSON.stringify((b.resolved || {})[name] ?? []);
    if (va !== vb) diffs.push(`${name}: PR=${va} merge_group=${vb}`);
  }
  return diffs;
}

if (require.main === module) {
  const [command, a, b] = process.argv.slice(2);

  if (command === 'write') {
    const digest = computeDigest();
    fs.writeFileSync('dep-digest.json', JSON.stringify(digest, null, 2));
    console.log(
      `dep-digest.json written (lockfile ${digest.lockfileSha.slice(0, 12)}, resolved ${digest.resolvedDigest.slice(0, 12)}, ${Object.keys(digest.resolved).length} packages)`
    );
  } else if (command === 'diff') {
    const diffs = diffDigests(a, b);
    if (diffs.length === 0) {
      console.log(
        'Dependency parity verified: merge_group digest matches PR-head digest.'
      );
      process.exit(0);
    }
    console.error(
      'DEPENDENCY PARITY MISMATCH — merge queue resolved different versions than the PR head:'
    );
    for (const d of diffs) console.error(`  ${d}`);
    process.exit(1);
  } else {
    console.error(
      'Usage: dep-parity.js write | diff <pr-digest.json> <mg-digest.json>'
    );
    process.exit(1);
  }
}

module.exports = {
  extractResolvedVersions,
  installedVersions,
  diffDigests,
  computeDigest,
};
