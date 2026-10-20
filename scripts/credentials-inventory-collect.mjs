#!/usr/bin/env node
/**
 * Regenerate ops/registry/inventory.gen.json with secret
 * NAMES (never values) from Doppler, Vercel and GitHub Actions.
 *
 *   node scripts/credentials-inventory-collect.mjs [--write]
 *
 * Needs a logged-in `doppler` and `gh`, and a Vercel token (VERCEL_TOKEN or the
 * local Vercel CLI login). Doppler is read with `--only-names`; Vercel env
 * listings are reduced to keys before leaving this process; GitHub secret
 * APIs never return values. A store that cannot be read keeps its previous
 * names and observedAt, so staleness surfaces in the check instead of a
 * silently emptied inventory.
 */

import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { INVENTORY_PATH } from './credentials-spend-check.mjs';
import {
  localVercelToken,
  VERCEL_TEAM_ID,
} from './lib/credentials-live-reads.mjs';

const run = promisify(execFile);
const DOPPLER_PROJECTS = ['jovie-web', 'jovie-eve-shadow', 'agent-mesh'];
const VERCEL_PROJECTS = ['jovie', 'jovie-eve-shadow', 'log-your-body', 'web'];
const GITHUB_REPOS = [
  'Jovie',
  'LogYourBody',
  'symphony-control',
  'summer-config',
];
const WORKFLOWS_DIR = resolve(import.meta.dirname, '../.github/workflows');

async function json(cmd, args) {
  const { stdout } = await run(cmd, args, {
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function dopplerStores() {
  const stores = [];
  for (const project of DOPPLER_PROJECTS) {
    const configs = await json('doppler', [
      'configs',
      '--project',
      project,
      '--json',
    ]);
    for (const config of configs) {
      const names = await json('doppler', [
        'secrets',
        '--only-names',
        '--project',
        project,
        '--config',
        config.name,
        '--json',
      ]);
      stores.push({
        id: `doppler:${project}:${config.name}`,
        kind: 'doppler-config',
        names: (Array.isArray(names) ? names : Object.keys(names)).sort(),
      });
    }
  }
  return stores;
}

async function vercelStores(token) {
  const stores = [];
  for (const project of VERCEL_PROJECTS) {
    const url = new URL(`https://api.vercel.com/v10/projects/${project}/env`);
    url.searchParams.set('teamId', VERCEL_TEAM_ID);
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(`vercel ${project} HTTP ${response.status}`);
    const keys = ((await response.json()).envs ?? []).map(env => env.key);
    stores.push({
      id: `vercel:${project}`,
      kind: 'vercel-project-env',
      names: [...new Set(keys)].sort(),
    });
  }
  return stores;
}

/** Secret names the Jovie workflows read via `secrets.NAME`. */
export function workflowSecretReferences(dir = WORKFLOWS_DIR) {
  const names = new Set();
  for (const file of readdirSync(dir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    for (const match of readFileSync(resolve(dir, file), 'utf8').matchAll(
      /secrets\.([A-Z][A-Z0-9_]*)/g
    ))
      names.add(match[1]);
  }
  names.delete('GITHUB_TOKEN');
  return names;
}

async function githubStores() {
  const stores = [];
  for (const repo of GITHUB_REPOS) {
    const names = await json('gh', [
      'api',
      '--paginate',
      `repos/JovieInc/${repo}/actions/secrets`,
      '--jq',
      '[.secrets[].name]',
    ]).catch(() => null);
    if (!names) continue;
    stores.push({
      id: `github:JovieInc/${repo}`,
      kind: 'github-actions-secrets',
      names: names.sort(),
    });
  }
  const environments = await json('gh', [
    'api',
    'repos/JovieInc/Jovie/environments',
    '--jq',
    '[.environments[].name]',
  ]);
  const envNames = new Set();
  for (const name of environments) {
    const list = await json('gh', [
      'api',
      '--paginate',
      `repos/JovieInc/Jovie/environments/${encodeURIComponent(name)}/secrets`,
      '--jq',
      '[.secrets[].name]',
    ]).catch(() => []);
    for (const secret of list) envNames.add(secret);
  }
  const jovie = stores.find(store => store.id === 'github:JovieInc/Jovie');
  if (jovie) {
    const held = new Set([...jovie.names, ...envNames]);
    jovie.environmentNames = [...envNames].sort();
    jovie.referencedMissing = [...workflowSecretReferences()]
      .filter(name => !held.has(name))
      .sort();
  }
  const org = await json('gh', [
    'api',
    'orgs/JovieInc/actions/secrets',
    '--jq',
    '[.secrets[].name]',
  ]).catch(() => null);
  if (org)
    stores.push({
      id: 'github:JovieInc',
      kind: 'github-org-secrets',
      names: org.sort(),
    });
  const apps = await json('gh', [
    'api',
    'orgs/JovieInc/installations',
    '--jq',
    '[.installations[].app_slug]',
  ]).catch(() => null);
  if (apps)
    stores.push({
      id: 'github:JovieInc:app-installations',
      kind: 'github-app-installations',
      names: apps.sort(),
    });
  return stores;
}

export function mergeStores(previous, fresh, observedAt) {
  const byId = new Map((previous ?? []).map(store => [store.id, store]));
  for (const store of fresh) byId.set(store.id, { ...store, observedAt });
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
  const registry = JSON.parse(readFileSync(INVENTORY_PATH, 'utf8'));
  const observedAt = new Date().toISOString();
  const fresh = [];
  const errors = [];
  for (const [label, collect] of [
    ['doppler', dopplerStores],
    [
      'vercel',
      () => vercelStores(process.env.VERCEL_TOKEN || localVercelToken()),
    ],
    ['github', githubStores],
  ]) {
    try {
      fresh.push(...(await collect()));
    } catch (error) {
      errors.push(
        `${label}: ${error instanceof Error ? error.message : error}`
      );
    }
  }
  registry.stores = mergeStores(registry.stores, fresh, observedAt);
  registry.inventoryObservedAt = observedAt;
  const total = registry.stores.reduce(
    (sum, store) => sum + store.names.length,
    0
  );
  process.stdout.write(
    `${registry.stores.length} stores, ${total} names${errors.length ? `; errors: ${errors.join('; ')}` : ''}\n`
  );
  if (process.argv.includes('--write'))
    writeFileSync(INVENTORY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
  if (errors.length) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`);
    process.exit(1);
  });
}
