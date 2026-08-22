#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { planActionsCacheGc } from './lib/actions-cache-gc.mjs';

function parseArgs(argv) {
  const args = {
    apply: false,
    file: null,
    repository: process.env.GITHUB_REPOSITORY,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') args.apply = true;
    else if (token === '--dry-run') args.apply = false;
    else if (token === '--file') args.file = argv[++index];
    else if (token === '--repository') args.repository = argv[++index];
  }
  return args;
}

function ghJson(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'gh failed');
  }
  return result.stdout;
}

function loadCaches(args) {
  if (args.file) {
    const parsed = JSON.parse(readFileSync(args.file, 'utf8'));
    return Array.isArray(parsed)
      ? parsed
      : (parsed.actions_caches ?? parsed.caches ?? []);
  }
  if (!args.repository) {
    throw new Error('repository is required');
  }
  const raw = ghJson([
    'api',
    '--paginate',
    `repos/${args.repository}/actions/caches`,
    '--jq',
    '.actions_caches[]',
  ]);
  const lines = raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  return lines.map(line => JSON.parse(line));
}

function main() {
  const args = parseArgs(process.argv);
  const caches = loadCaches(args);
  const plan = planActionsCacheGc({ caches });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  if (!args.apply) {
    console.error(
      `[actions-cache-gc] dry-run: would delete ${plan.deleteCount} turbo cache(s); protected=${plan.protected}`
    );
    return;
  }
  for (const cache of plan.deletions) {
    ghJson([
      'api',
      '-X',
      'DELETE',
      `repos/${args.repository}/actions/caches/${cache.id}`,
    ]);
    console.error(`[actions-cache-gc] deleted ${cache.id} ${cache.key}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
