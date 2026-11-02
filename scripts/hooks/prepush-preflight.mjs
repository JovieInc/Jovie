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
import {
  chooseBackend,
  chooseMode,
  isInfraTimeout,
} from '../lib/prepush-offload.mjs';

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

function gemLoad() {
  const r = spawnSync(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=4',
      'gem',
      'cat /proc/loadavg; nproc',
    ],
    { encoding: 'utf8', timeout: 8000 }
  );
  if (r.status !== 0) return null;
  const lines = r.stdout.trim().split('\n');
  return {
    load: Number.parseFloat(lines[0]),
    cores: Number.parseInt(lines.at(-1), 10),
  };
}

const ARGV = {
  gem: ['scripts/preflight-remote.mjs', '--bundle', '--fast'],
  actions: ['scripts/preflight-remote.mjs', '--backend', 'actions'],
};
const unavailable = code => code === 127 || code === 255;

export async function main() {
  const t0 = Date.now();
  const load = loadavg()[0];
  const cores = cpus().length;
  const gem = chooseMode({ load, cores, env }) === 'local' ? null : gemLoad();
  const first = chooseBackend({ load, cores, gem, env });
  // Fallbacks only when a backend is unavailable (infra); the gate is never skipped.
  const order = [
    first,
    ...['gem', 'actions', 'local'].filter(b => b !== first),
  ];
  let backend = first;
  const infra = [];
  let code = 1;
  for (const b of order) {
    backend = b;
    if (b === 'local') {
      const r = await run(LOCAL);
      code = r.code;
      if (code !== 0 && isInfraTimeout(r)) {
        infra.push('local-timeout');
        console.error(
          `\n[pre-push] INFRA FAILURE, not a code verdict: a check timed out or was killed under host load ${loadavg()[0].toFixed(0)} on ${cores} cores. Re-running the identical gate remotely.`
        );
        for (const rb of ['gem', 'actions']) {
          backend = rb;
          const rr = await run(ARGV[rb]);
          code = rr.code;
          if (code === 0 || (!unavailable(code) && !isInfraTimeout(rr))) break;
          infra.push(`${rb}-${unavailable(code) ? 'unavailable' : 'timeout'}`);
        }
      }
      break;
    }
    console.error(
      `[pre-push] load ${load.toFixed(0)}/${cores} cores${gem ? `, gem ${gem.load.toFixed(0)}/${gem.cores}` : ''}: running the identical gate on ${b} (evidence bound to HEAD sha + tree)`
    );
    const r = await run(ARGV[b]);
    code = r.code;
    if (unavailable(code)) {
      infra.push(`${b}-unavailable`);
      console.error(
        `[pre-push] INFRA: ${b} unavailable (not a code failure); trying the next backend`
      );
      continue;
    }
    if (code !== 0 && isInfraTimeout(r)) {
      infra.push(`${b}-timeout`);
      console.error(
        `\n[pre-push] INFRA FAILURE, not a code verdict: a check timed out on ${b}. Retrying once.`
      );
      code = (await run(ARGV[b])).code;
    }
    break;
  }
  const outcome = code === 0 ? 'pass' : 'fail';
  if (code !== 0) {
    console.error(
      backend === 'local'
        ? '[pre-push] RED: fix the items above and push again.'
        : `[pre-push] RED on ${backend}: a real failure. Fix and push again.`
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
        backend,
        mode: backend,
        load,
        cores,
        gem,
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
