#!/usr/bin/env node
/**
 * Agent capacity registry CLI (metadata only).
 *
 *   node scripts/capacity-registry.mjs show [--json] [--live <capacity-live.json>]
 *   node scripts/capacity-registry.mjs check     validate + joins + canon/CAPACITY.md drift
 *   node scripts/capacity-registry.mjs canon [--write]
 *   node scripts/capacity-registry.mjs route     delegation order for non-lane agents
 *
 * Non-lane agents (Summer, Dots, Instinct, Lola, Claude/Codex sessions) load
 * canon/CAPACITY.md or run `show --json`; lanes read the same file through
 * scripts/lanes/capacity_registry.py.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateRegistry,
  renderCanon,
  routingOrder,
  validateRegistry,
} from './lib/capacity-registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAPACITY_PATH = resolve(ROOT, 'ops/registry/capacity.json');
export const SPEND_PATH = resolve(ROOT, 'ops/registry/spend.json');
export const IDENTITIES_PATH = resolve(ROOT, 'canon/agent-identities.json');
export const CANON_PATH = resolve(ROOT, 'canon/CAPACITY.md');

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

export function loadAll({ capacityPath = CAPACITY_PATH } = {}) {
  return {
    registry: readJson(capacityPath),
    spend: readJson(SPEND_PATH),
    identities: readJson(IDENTITIES_PATH),
  };
}

export function buildCanon({ registry, spend }) {
  const view = evaluateRegistry(registry, {
    now: Date.parse(registry.updatedAt),
    spend,
  });
  return `${renderCanon(view, registry)}\n`;
}

export function check(inputs = loadAll(), canonPath = CANON_PATH) {
  const { registry, spend, identities } = inputs;
  const errors = validateRegistry(registry, {
    agentIds: Object.keys(identities.identities),
    spendIds: spend.providers.map(p => p.id),
  });
  const expected = buildCanon(inputs);
  const actual = existsSync(canonPath) ? readFileSync(canonPath, 'utf8') : '';
  if (actual !== expected) {
    errors.push(
      'canon/CAPACITY.md is out of date: run node scripts/capacity-registry.mjs canon --write'
    );
  }
  return errors;
}

function main(argv) {
  const [command = 'show', ...flags] = argv;
  const inputs = loadAll();
  const liveFlag = flags.indexOf('--live');
  const live = liveFlag >= 0 ? readJson(flags[liveFlag + 1]) : {};
  if (command === 'check') {
    const errors = check(inputs);
    for (const error of errors) console.error(`capacity-registry: ${error}`);
    return errors.length ? 1 : 0;
  }
  if (command === 'canon') {
    const body = buildCanon(inputs);
    if (flags.includes('--write')) writeFileSync(CANON_PATH, body);
    else process.stdout.write(body);
    return 0;
  }
  const view = evaluateRegistry(inputs.registry, { live, spend: inputs.spend });
  if (command === 'route') {
    console.log(JSON.stringify(routingOrder(view), null, 2));
    return 0;
  }
  if (command === 'show') {
    console.log(
      flags.includes('--json')
        ? JSON.stringify(view, null, 2)
        : renderCanon(view, inputs.registry)
    );
    return 0;
  }
  console.error('usage: capacity-registry.mjs show|check|canon|route');
  return 2;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
