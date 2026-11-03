import { cpus, loadavg } from 'node:os';

/** Hint printed when this host is saturated: run the same gate on Gem instead. */
export function remoteHint({
  load = loadavg()[0],
  cores = cpus().length,
  env = process.env,
} = {}) {
  if (env.CI || env.GEM_TYPECHECK_SLOTS || load <= cores * 2) return null;
  return `[preflight:changed] load ${load.toFixed(0)} > 2x ${cores} cores; run \`pnpm preflight:remote\` (same args) to execute on Gem`;
}
