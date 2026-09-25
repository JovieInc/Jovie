#!/usr/bin/env node

/**
 * Dependency Parity Digest
 *
 * Records a resolved-dependency digest for a CI run so merge_group runs can be
 * compared against the digests produced by the PR-head runs being merged.
 * Detects the "lockfile drifted between PR head and merge commit" class
 * (e.g. js-yaml resolving v5 on the merge group vs v4 on the PR head).
 *
 * The digest is computed from pnpm-lock.yaml directly — no install required:
 * with a frozen lockfile, resolved versions ARE the lockfile contents, so a
 * lockfile sha plus the extracted name->versions map is the parity contract.
 *
 * Usage:
 *   node dep-parity.js write   # writes dep-digest.json in cwd
 *   node dep-parity.js diff dep-digest.pr.json dep-digest.mg.json
 *                              # exits 1 listing differing packages
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function computeDigest() {
  const lockfilePath = path.join(process.cwd(), 'pnpm-lock.yaml');
  if (!fs.existsSync(lockfilePath)) {
    throw new Error('pnpm-lock.yaml not found');
  }
  const lockfileText = fs.readFileSync(lockfilePath, 'utf8');
  const lockfileSha = crypto
    .createHash('sha256')
    .update(lockfileText)
    .digest('hex');

  const resolved = extractResolvedVersions(lockfileText);
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

module.exports = { extractResolvedVersions, diffDigests, computeDigest };
