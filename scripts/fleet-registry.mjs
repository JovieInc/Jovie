#!/usr/bin/env node
/**
 * Fleet registry CLI.
 *   node scripts/fleet-registry.mjs check        validate + joins
 *   node scripts/fleet-registry.mjs show [--json]
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFleetRegistry } from './lib/fleet-registry.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const FLEET_PATH = resolve(ROOT, 'ops/registry/fleet.json');
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));

export function loadAll() {
  return {
    registry: readJson(FLEET_PATH),
    identities: readJson(resolve(ROOT, 'canon/agent-identities.json'))
      .identities,
    capacity: readJson(resolve(ROOT, 'ops/registry/capacity.json')),
  };
}
export function check({ registry, identities, capacity } = loadAll()) {
  return validateFleetRegistry(registry, {
    identities,
    providerIds: capacity.providers.map(p => p.id),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command = 'show', ...flags] = process.argv.slice(2);
  if (command === 'check') {
    const errors = check();
    for (const e of errors) console.error(`fleet-registry: ${e}`);
    process.exitCode = errors.length ? 1 : 0;
  } else {
    const { registry } = loadAll();
    if (flags.includes('--json'))
      console.log(JSON.stringify(registry, null, 2));
    else
      for (const a of registry.agents)
        console.log(
          [
            a.id,
            a.status,
            a.route.kind,
            a.tos.verdict,
            a.verified.level,
            (a.standingWorkloads ?? []).join(','),
          ].join('\t')
        );
  }
}
