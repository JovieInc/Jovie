#!/usr/bin/env node
// Toolchain drift: do the host and the repo agree on node and pnpm, and is the
// repo pin behind the latest patch of its Node line?
//
//   node scripts/toolchain-drift.mjs            repo pins vs each other and nodejs.org
//   node scripts/toolchain-drift.mjs --freshness also flag a pin behind its line's latest patch
//   node scripts/toolchain-drift.mjs --host     also compare THIS host's node/pnpm (lanes doctor, runners)
//
// Pure comparison lives in `compare`; exits 1 on drift so a clock/event can alarm it.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('..', import.meta.url);
const read = file => readFileSync(new URL(file, ROOT), 'utf8');
const trim = value =>
  String(value ?? '')
    .trim()
    .replace(/^v/, '');

export function parseSemver(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(trim(value));
  return m ? m.slice(1).map(Number) : null;
}
export function cmp(a, b) {
  const x = parseSemver(a);
  const y = parseSemver(b);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/** @returns {{ok: boolean, drift: {check: string, expected: string, actual: string}[]}} */
export function compare({
  nvmrc,
  nodeVersionFile,
  engineNode,
  packageManager,
  latestInLine,
  host,
}) {
  const drift = [];
  const pin = trim(nvmrc);
  if (nodeVersionFile !== undefined && trim(nodeVersionFile) !== pin) {
    drift.push({
      check: '.node-version vs .nvmrc',
      expected: pin,
      actual: trim(nodeVersionFile),
    });
  }
  const floor = /(\d+\.\d+\.\d+)/.exec(engineNode ?? '')?.[1];
  if (floor && floor !== pin)
    drift.push({
      check: 'package.json engines.node floor vs .nvmrc',
      expected: pin,
      actual: floor,
    });
  if (latestInLine && parseSemver(pin) && cmp(latestInLine, pin) > 0) {
    drift.push({
      check: 'repo pin behind latest patch of its Node line',
      expected: trim(latestInLine),
      actual: pin,
    });
  }
  const pnpmPin = /pnpm@(\d+\.\d+\.\d+)/.exec(packageManager ?? '')?.[1];
  if (host) {
    if (host.node && trim(host.node) !== pin)
      drift.push({
        check: 'host node vs .nvmrc',
        expected: pin,
        actual: trim(host.node),
      });
    if (host.pnpm && pnpmPin && trim(host.pnpm) !== pnpmPin)
      drift.push({
        check: 'host pnpm vs packageManager',
        expected: pnpmPin,
        actual: trim(host.pnpm),
      });
  }
  return { ok: drift.length === 0, drift };
}

async function latestPatch(pin) {
  try {
    const res = await fetch('https://nodejs.org/dist/index.json', {
      signal: AbortSignal.timeout(15_000),
    });
    const major = parseSemver(pin)?.[0];
    const rows = await res.json();
    return rows
      .map(r => trim(r.version))
      .filter(v => parseSemver(v)?.[0] === major)
      .sort(cmp)
      .at(-1);
  } catch {
    return undefined; // network failure is not drift
  }
}

function tool(bin, args) {
  try {
    return execFileSync(bin, args, {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
  } catch {
    return undefined;
  }
}

async function main() {
  const pkg = JSON.parse(read('package.json'));
  let nodeVersionFile;
  try {
    nodeVersionFile = read('.node-version');
  } catch {}
  const input = {
    nvmrc: read('.nvmrc'),
    nodeVersionFile,
    engineNode: pkg.engines?.node,
    packageManager: pkg.packageManager,
    // node-runtime-freshness.yml owns the 7-day patch SLA; --freshness only reports it here.
    latestInLine: process.argv.includes('--freshness')
      ? await latestPatch(read('.nvmrc'))
      : undefined,
    host: process.argv.includes('--host')
      ? { node: process.version, pnpm: tool('pnpm', ['-v']) }
      : undefined,
  };
  const result = compare(input);
  console.log(
    JSON.stringify({
      ...result,
      pins: { node: trim(input.nvmrc), pnpm: input.packageManager },
      latestInLine: input.latestInLine ?? null,
    })
  );
  for (const d of result.drift)
    console.error(
      `::error::Toolchain drift: ${d.check} (expected ${d.expected}, got ${d.actual})`
    );
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
