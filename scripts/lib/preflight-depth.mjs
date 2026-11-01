/**
 * Recursion guard for preflight entrypoints (incident 2026-11-01: a branch made
 * `preflight-changed.mjs --hook` re-enter itself; 194 copies, 1,293 defunct
 * processes, Gem load 1,661). A preflight sets JOVIE_PREFLIGHT_DEPTH in the
 * environment of everything it spawns; any preflight entrypoint (or the
 * pre-push gate) that finds it already set is nested and refuses to run.
 * The guard sits at the CLI entrypoint, not in main(), so in-process tests that
 * call main() directly are unaffected.
 */
export const DEPTH_VAR = 'JOVIE_PREFLIGHT_DEPTH';

export function nestedPreflightMessage(name, env = process.env) {
  if (!env[DEPTH_VAR]) return null;
  return `[${name}] refusing to run: nested preflight (${DEPTH_VAR}=${env[DEPTH_VAR]}). A preflight check re-entered a preflight or the pre-push gate; fix the caller.`;
}

/** Environment for children of a preflight: marks them as nested. */
export function withPreflightDepth(env = process.env) {
  return { ...env, [DEPTH_VAR]: String(Number(env[DEPTH_VAR] || 0) + 1) };
}

/** CLI-entrypoint guard: returns an exit code when nested, else null. */
export function guardNested(name, env = process.env, err = console.error) {
  const message = nestedPreflightMessage(name, env);
  if (!message) return null;
  err(message);
  return 1;
}
