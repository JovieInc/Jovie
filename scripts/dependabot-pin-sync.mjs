#!/usr/bin/env node
/**
 * Dependabot pin sync. A Dependabot group bumps a package in the workspace
 * manifests (react, vite, jsdom, postcss, ...) but leaves the matching root
 * `pnpm.overrides` pin behind, so frozen installs fail or the override keeps
 * the old version. This script raises such an override to the single version
 * every workspace manifest declares. It only ever raises an exact pin that
 * duplicates a workspace pin. Security pins on transitive packages, range
 * overrides and selector keys (`a>b`, `a@^1`) are never touched.
 *
 * The workflow runs this file from trusted main against a Dependabot head
 * checked out without credentials. It never executes PR code.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXACT = /^\d+\.\d+\.\d+$/u;
const DECLARED = /^[~^]?(\d+\.\d+\.\d+)$/u;
const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies'];
/** Workspaces outside the root lockfile (own lockfile, own policy). */
const ISOLATED = new Set(['apps/eve-pilot']);
export const ALLOWED_FILE =
  /^(?:pnpm-lock\.yaml|(?:[\w.-]+\/)*package\.json|apps\/eve-pilot\/pnpm-lock\.yaml)$/u;

/** @param {string} a @param {string} b */
export function compareVersions(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** Root-relative workspace dirs from pnpm-workspace.yaml `dir/*` patterns. */
export function workspaceDirs(root) {
  const text = (
    /^packages:\n((?:[ \t]+.*\n?)*)/mu.exec(
      readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
    )?.[1] ?? ''
  ).trimEnd();
  /** @type {string[]} */
  const include = [];
  const exclude = new Set(ISOLATED);
  for (const match of text.matchAll(
    /^\s+-\s+['"]?(!?)([\w./*-]+)['"]?\s*$/gmu
  )) {
    if (match[1]) exclude.add(match[2]);
    else include.push(match[2]);
  }
  /** @type {string[]} */
  const dirs = [];
  for (const pattern of include) {
    if (!pattern.endsWith('/*')) continue;
    const parent = pattern.slice(0, -2);
    if (!existsSync(join(root, parent))) continue;
    for (const name of readdirSync(join(root, parent)).sort()) {
      const dir = `${parent}/${name}`;
      if (!exclude.has(dir) && existsSync(join(root, dir, 'package.json')))
        dirs.push(dir);
    }
  }
  return dirs;
}

/**
 * @param {Record<string, any>} rootManifest
 * @param {Record<string, any>[]} manifests root first, then every workspace
 * @returns {{name: string, from: string, to: string}[]}
 */
export function planOverrideSync(rootManifest, manifests) {
  const overrides = rootManifest?.pnpm?.overrides ?? {};
  /** @type {Map<string, Set<string>>} */
  const declared = new Map();
  for (const manifest of manifests)
    for (const section of SECTIONS)
      for (const [name, spec] of Object.entries(manifest?.[section] ?? {})) {
        if (!(name in overrides)) continue;
        const version = DECLARED.exec(String(spec))?.[1] ?? 'unpinned';
        const set = declared.get(name) ?? new Set();
        set.add(version);
        declared.set(name, set);
      }
  const changes = [];
  for (const [name, pin] of Object.entries(overrides)) {
    if (typeof pin !== 'string' || !EXACT.test(pin)) continue;
    const versions = declared.get(name);
    if (!versions || versions.size !== 1) continue;
    const [version] = versions;
    if (version === 'unpinned' || compareVersions(version, pin) <= 0) continue;
    changes.push({ name, from: pin, to: version });
  }
  return changes;
}

/** Applies the plan in place, preserving 2-space JSON and key order. */
export function syncOverridePins(root) {
  const path = join(root, 'package.json');
  const rootManifest = JSON.parse(readFileSync(path, 'utf8'));
  const manifests = [
    rootManifest,
    ...workspaceDirs(root).map(dir =>
      JSON.parse(readFileSync(join(root, dir, 'package.json'), 'utf8'))
    ),
  ];
  const changes = planOverrideSync(rootManifest, manifests);
  for (const { name, to } of changes) rootManifest.pnpm.overrides[name] = to;
  if (changes.length > 0)
    writeFileSync(path, `${JSON.stringify(rootManifest, null, 2)}\n`);
  return changes;
}

/**
 * Fail-closed identity check for the PR the workflow is about to write to.
 * @param {{pr: any, files: string[], expectedHead: string, repository: string}} input
 * @returns {string | null} refusal reason, or null when eligible
 */
export function refusal({ pr, files, expectedHead, repository }) {
  if (!pr || !Array.isArray(files) || files.length === 0) return 'missing-pr';
  if (pr.state !== 'open') return 'pr-not-open';
  if (pr.user?.login !== 'dependabot[bot]') return 'author-not-dependabot';
  if (!String(pr.head?.ref ?? '').startsWith('dependabot/npm_and_yarn/'))
    return 'not-npm-dependabot-branch';
  if (
    pr.base?.ref !== 'main' ||
    pr.head?.repo?.full_name !== repository ||
    pr.base?.repo?.full_name !== repository
  )
    return 'unsafe-repository-boundary';
  if (!/^[0-9a-f]{40}$/u.test(expectedHead) || pr.head?.sha !== expectedHead)
    return 'head-drift';
  if (files.some(file => !ALLOWED_FILE.test(file)))
    return 'non-dependency-file-changed';
  return null;
}

/**
 * @param {string} path
 * @param {string} token
 * @param {RequestInit} [init]
 * @returns {Promise<any>}
 */
async function github(path, token, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });
  /** @type {any} */
  const body = await response.json();
  if (!response.ok)
    throw new Error(`GitHub ${response.status} for ${path}: ${body?.message}`);
  return body;
}

const CREATE_COMMIT = `mutation PinSync($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid } }
}`;

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

function output(key, value) {
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`, {
      flag: 'a',
    });
}

async function main() {
  const [command] = process.argv.slice(2);
  const token = process.env.GH_TOKEN ?? '';
  const repository = arg('repo') ?? '';
  if (command === 'guard') {
    const number = Number(arg('pr'));
    const pr = await github(`/repos/${repository}/pulls/${number}`, token);
    const files = (
      await github(
        `/repos/${repository}/pulls/${number}/files?per_page=100`,
        token
      )
    ).map(file => file.filename);
    const reason = refusal({
      pr,
      files,
      expectedHead: arg('head') ?? '',
      repository,
    });
    console.log(reason ? `refused: ${reason}` : 'eligible');
    output('eligible', reason ? 'false' : 'true');
    output('branch', reason ? '' : pr.head.ref);
    return;
  }
  if (command === 'sync') {
    const changes = syncOverridePins(arg('root') ?? '.');
    for (const change of changes)
      console.log(`override ${change.name}: ${change.from} -> ${change.to}`);
    output('overrides_changed', changes.length > 0 ? 'true' : 'false');
    return;
  }
  if (command === 'commit') {
    const root = arg('root') ?? '.';
    const files = (arg('files') ?? '').split(',').filter(Boolean);
    if (files.length === 0 || files.some(file => !ALLOWED_FILE.test(file)))
      throw new Error(
        'refusing to commit files outside the dependency allowlist'
      );
    const additions = files.map(path => ({
      path,
      contents: readFileSync(join(root, path)).toString('base64'),
    }));
    const result = await github('/graphql', token, {
      method: 'POST',
      body: JSON.stringify({
        query: CREATE_COMMIT,
        variables: {
          input: {
            branch: {
              repositoryNameWithOwner: repository,
              branchName: arg('branch'),
            },
            expectedHeadOid: arg('head'),
            message: {
              headline:
                'fix(deps): sync root overrides and lockfiles with the Dependabot bump',
            },
            fileChanges: { additions },
          },
        },
      }),
    });
    if (result.errors) throw new Error(JSON.stringify(result.errors));
    output('head_sha', result.data.createCommitOnBranch.commit.oid);
    console.log(
      `committed ${result.data.createCommitOnBranch.commit.oid}: ${files.join(', ')}`
    );
    return;
  }
  throw new Error(`unknown command: ${command}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
