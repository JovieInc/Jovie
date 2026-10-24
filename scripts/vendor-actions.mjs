#!/usr/bin/env node
// JOV-8754: vendored GitHub Actions used by .github/actions/setup-node-pnpm.
//
// Every remote `uses:` costs one GITHUB_TOKEN REST call per job to download the
// action, and a composite action re-resolves its nested remote actions on each
// use. The repo bucket (5,000/h) ran dry hourly on 2026-10-21. Vendoring the
// composite's nested actions at their exact pinned SHAs removes those calls.
//
//   node scripts/vendor-actions.mjs --check
//     offline integrity check: every vendored file matches manifest.json, no
//     unlisted files, and each vendored SHA equals the SHA the workflows pin
//     for the same action (so Dependabot bumps force a refresh).
//   node scripts/vendor-actions.mjs --refresh <dir> [--sha <sha>]
//     re-fetch <dir>'s repo at the workflows' pinned SHA (or --sha), copy the
//     manifest's file list, and rewrite hashes. Review the diff like any
//     dependency bump.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const VENDOR_ROOT = '.github/actions/vendor';
export const MANIFEST_SCHEMA = 'jovie-vendored-actions/v1';

const sha256 = path =>
  createHash('sha256').update(readFileSync(path)).digest('hex');

function listFiles(root) {
  const out = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}

export function loadManifest(repoRoot) {
  return JSON.parse(
    readFileSync(resolve(repoRoot, VENDOR_ROOT, 'manifest.json'), 'utf8')
  );
}

/** Most common SHA each `owner/repo` is pinned to across workflows and actions. */
export function workflowPins(repoRoot) {
  const counts = new Map();
  const scan = dir => {
    for (const path of listFiles(resolve(repoRoot, dir))) {
      if (!/\.ya?ml$/.test(path) || path.includes(`${VENDOR_ROOT}/`)) continue;
      const text = readFileSync(path, 'utf8');
      for (const match of text.matchAll(
        /uses:\s+([\w.-]+\/[\w.-]+)(?:\/[\w./-]+)?@([0-9a-f]{40})/g
      )) {
        const key = `${match[1]}@${match[2]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  };
  scan('.github/workflows');
  scan('.github/actions');
  const best = new Map();
  for (const [key, count] of counts) {
    const [repo, sha] = key.split('@');
    if (!best.has(repo) || best.get(repo).count < count)
      best.set(repo, { sha, count });
  }
  return new Map([...best].map(([repo, value]) => [repo, value.sha]));
}

/** @returns {string[]} problems; empty when the vendored trees are intact. */
export function checkVendored(repoRoot) {
  const problems = [];
  const manifest = loadManifest(repoRoot);
  if (manifest.schema !== MANIFEST_SCHEMA) problems.push('manifest schema');
  const pins = workflowPins(repoRoot);
  const listed = new Set();
  for (const action of manifest.actions ?? []) {
    const base = resolve(repoRoot, VENDOR_ROOT, action.dir);
    for (const [file, hash] of Object.entries(action.files ?? {})) {
      listed.add(resolve(base, file));
      let actual;
      try {
        actual = sha256(resolve(base, file));
      } catch {
        problems.push(`${action.dir}/${file}: missing`);
        continue;
      }
      if (actual !== hash)
        problems.push(`${action.dir}/${file}: hash mismatch`);
    }
    const pinned = pins.get(action.repo);
    if (pinned && pinned !== action.sha) {
      problems.push(
        `${action.dir}: vendored ${action.repo}@${action.sha} but workflows pin @${pinned}; run node scripts/vendor-actions.mjs --refresh ${action.dir}`
      );
    }
  }
  for (const path of listFiles(resolve(repoRoot, VENDOR_ROOT))) {
    if (path.endsWith('/manifest.json')) continue;
    if (!listed.has(path))
      problems.push(`${relative(repoRoot, path)}: not in manifest`);
  }
  return problems;
}

function refresh(repoRoot, dir, shaOverride) {
  const manifest = loadManifest(repoRoot);
  const action = manifest.actions.find(item => item.dir === dir);
  if (!action) throw new Error(`unknown vendored action ${dir}`);
  const sha =
    shaOverride ?? workflowPins(repoRoot).get(action.repo) ?? action.sha;
  const work = mkdtempSync(join(tmpdir(), 'vendor-action-'));
  try {
    execFileSync('git', ['init', '-q', work]);
    execFileSync('git', [
      '-C',
      work,
      'fetch',
      '-q',
      '--depth',
      '1',
      `https://github.com/${action.repo}`,
      sha,
    ]);
    execFileSync('git', ['-C', work, 'checkout', '-q', 'FETCH_HEAD']);
    const base = resolve(repoRoot, VENDOR_ROOT, dir);
    rmSync(base, { recursive: true, force: true });
    const files = {};
    for (const file of Object.keys(action.files)) {
      const target = resolve(base, file);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(work, file.replace(/^/, '')), target);
      files[file] = sha256(target);
    }
    action.sha = sha;
    action.files = files;
    writeFileSync(
      resolve(repoRoot, VENDOR_ROOT, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`
    );
    console.log(`refreshed ${dir} at ${action.repo}@${sha}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const argv = process.argv.slice(2);
  const repoRoot = process.cwd();
  if (argv[0] === '--check') {
    const problems = checkVendored(repoRoot);
    for (const problem of problems) console.error(`::error::${problem}`);
    process.exit(problems.length ? 1 : 0);
  } else if (argv[0] === '--refresh' && argv[1]) {
    const shaIndex = argv.indexOf('--sha');
    refresh(repoRoot, argv[1], shaIndex > 0 ? argv[shaIndex + 1] : undefined);
  } else {
    console.error(
      'usage: vendor-actions.mjs --check | --refresh <dir> [--sha <sha>]'
    );
    process.exit(2);
  }
}
