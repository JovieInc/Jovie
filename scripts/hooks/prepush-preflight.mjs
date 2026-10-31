#!/usr/bin/env node
/**
 * Load-aware pre-push step: `preflight:changed --hook --fast`, identical gate
 * either way.
 *  - host load (1m) > cores x 1.5 -> run it on Gem via preflight:remote
 *  - local run killed/timed out -> infra failure (not a code verdict): rerun the
 *    identical gate on Gem and report the timeout as infrastructure
 * A Gem pass counts only with evidence bound to this exact HEAD sha + tree
 * (preflight-remote --bundle). Nothing is skipped; --no-verify is never used.
 * Every run appends to ~/.local/state/jovie-lanes/prepush.jsonl (wall time, mode, outcome).
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { cpus, homedir, loadavg } from 'node:os';
import path from 'node:path';
import { chooseMode, isInfraTimeout } from '../lib/prepush-offload.mjs';

const env = process.env;
const g = a => spawnSync('git', a, { encoding: 'utf8' }).stdout.trim();

function run(argv) {
  return new Promise(resolve => {
    const child = spawn('node', argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const take = d => {
      process.stderr.write(d);
      out = (out + d.toString()).slice(-200_000);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);
    child.on('close', (code, sig) =>
      resolve({ code: code ?? (sig ? 137 : 1), out })
    );
  });
}

const LOCAL = ['scripts/preflight-changed.mjs', '--hook', '--fast'];
const REMOTE = ['scripts/preflight-remote.mjs', '--bundle', '--fast'];

export async function main() {
  const t0 = Date.now();
  const load = loadavg()[0];
  const cores = cpus().length;
  let mode = chooseMode({ load, cores, env });
  let outcome;
  let infra = null;
  let code;
  let lastRemote = null;
  if (mode === 'remote') {
    console.error(
      `[pre-push] load ${load.toFixed(0)} > ${cores} cores x 1.5: running the identical gate on Gem (preflight:remote), evidence bound to HEAD sha + tree`
    );
    lastRemote = await run(REMOTE);
    code = lastRemote.code;
    if (code === 127 || code === 255) {
      infra = 'gem-unreachable';
      console.error(
        '[pre-push] INFRA: Gem unreachable (not a code failure); running the gate locally instead'
      );
      mode = 'local-fallback';
    }
  }
  if (mode !== 'remote') {
    const r = await run(LOCAL);
    code = r.code;
    if (code !== 0 && !infra && isInfraTimeout(r)) {
      infra = 'local-timeout';
      console.error(
        `\n[pre-push] INFRA FAILURE, not a code verdict: a check timed out or was killed under host load ${loadavg()[0].toFixed(0)} on ${cores} cores. Re-running the identical gate on Gem.`
      );
      mode = 'remote-after-timeout';
      lastRemote = await run(REMOTE);
      code = lastRemote.code;
    }
  }
  if (
    code !== 0 &&
    mode.startsWith('remote') &&
    lastRemote &&
    isInfraTimeout(lastRemote)
  ) {
    infra = `${infra ?? 'remote'}+gem-timeout`;
    console.error(
      '\n[pre-push] INFRA FAILURE, not a code verdict: a check timed out on Gem under load. Retrying the identical gate on Gem once.'
    );
    ({ code } = await run(REMOTE));
  }
  outcome = code === 0 ? 'pass' : 'fail';
  if (code !== 0) {
    console.error(
      infra && mode.startsWith('remote')
        ? '[pre-push] RED on Gem: a real failure (reproduced off the loaded host). Fix and push again.'
        : '[pre-push] RED: fix the items above and push again.'
    );
  }
  try {
    const dir =
      env.JOVIE_PREFLIGHT_LEDGER_DIR ||
      path.join(homedir(), '.local', 'state', 'jovie-lanes');
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      path.join(dir, 'prepush.jsonl'),
      `${JSON.stringify({
        at: new Date().toISOString(),
        sha: g(['rev-parse', 'HEAD']),
        tree: g(['rev-parse', 'HEAD^{tree}']),
        mode,
        load,
        cores,
        infra,
        outcome,
        wallMs: Date.now() - t0,
      })}\n`
    );
  } catch {
    // measurement must never fail the gate
  }
  return code;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  process.exitCode = await main();
}
