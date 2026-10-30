/**
 * Lanes and agents never run a production build or a full e2e run locally: hosted CI runs them (free and
 * parallel) and one `next build` plus tsc and playwright took gem to load 43 on 16 cores (2026-10-26).
 * The lanes set LANES_NO_LOCAL_BUILD=1 for every agent and gate; this exits 3 with a message that tells the
 * agent to rely on CI. Outside the lanes (a developer, a CI runner) it does nothing.
 */
export function laneHeavyDenied(what, env = process.env) {
  return env.LANES_NO_LOCAL_BUILD === '1'
    ? `${what} is skipped on lane hosts: CI runs it on hosted runners. Do not retry it; run a targeted test or typecheck instead and let CI report the rest.`
    : null;
}

/**
 * `exit` is `(code?: number) => void`. Defaulting the parameter to
 * `process.exit` infers a `never` return, and checkJs then rejects a callback
 * that records the status instead of stopping the process.
 * @param {string} what
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(code?: number) => void} [exit]
 */
export function denyLaneHeavy(what, env = process.env, exit = process.exit) {
  const message = laneHeavyDenied(what, env);
  if (message) {
    console.error(`[lane-heavy-guard] ${message}`);
    exit(3);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  denyLaneHeavy(process.argv.slice(2).join(' ') || 'this command');
}
