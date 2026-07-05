/**
 * Shared gbrain Supabase pool-budget defaults for Jovie-owned wrappers.
 *
 * gbrain opens per-process read + direct pools (defaults 10 + 3). Multiple
 * overlapping CLI processes (serve, autopilot, sync) multiply connections and
 * can exhaust low-cap Supabase / Supavisor tiers. Upstream gbrain honors:
 *   - GBRAIN_POOL_SIZE
 *   - GBRAIN_DIRECT_POOL_SIZE
 *   - GBRAIN_DISABLE_DIRECT_POOL
 *   - GBRAIN_MAX_CONNECTIONS (opt-in budget clamp for parallel sync workers)
 *
 * PGLite engines do not use Postgres pooling — this helper is a no-op there.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Conservative defaults for Supabase session pooler (pool_size often 15). */
export const SUPABASE_POOL_BUDGET_DEFAULTS = Object.freeze({
  GBRAIN_DISABLE_DIRECT_POOL: '1',
  GBRAIN_POOL_SIZE: '2',
  GBRAIN_DIRECT_POOL_SIZE: '1',
  GBRAIN_MAX_CONNECTIONS: '15',
});

const SUPABASE_HOST_MARKERS = [
  'pooler.supabase.com',
  'supabase.co',
  'supabase.in',
];

/**
 * @param {unknown} config
 * @returns {boolean}
 */
export function engineNeedsPoolBudget(config) {
  if (!config || typeof config !== 'object') return false;

  const record = /** @type {Record<string, unknown>} */ (config);
  const engine =
    typeof record.engine === 'string' ? record.engine.toLowerCase() : '';

  if (engine === 'pglite') return false;
  if (engine === 'postgres' || engine === 'supabase') return true;

  const urlCandidates = [
    record.database_url,
    record.pooler_url,
    record.direct_database_url,
  ].filter(value => typeof value === 'string');

  return urlCandidates.some(url =>
    SUPABASE_HOST_MARKERS.some(marker => url.includes(marker))
  );
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Record<string, string>} defaults
 * @returns {Record<string, string>}
 */
export function resolvePoolBudgetEnv(
  env,
  defaults = SUPABASE_POOL_BUDGET_DEFAULTS
) {
  /** @type {Record<string, string>} */
  const resolved = {};

  for (const [key, fallback] of Object.entries(defaults)) {
    const current = env[key];
    resolved[key] = current && current.length > 0 ? current : fallback;
  }

  return resolved;
}

/**
 * @param {string | undefined} configPath
 * @param {Record<string, string | undefined>} env
 * @returns {{ apply: boolean, env: Record<string, string>, reason: string }}
 */
export function planPoolBudget(configPath, env = process.env) {
  if (
    env.GBRAIN_POOL_BUDGET_DISABLED === '1' ||
    env.GBRAIN_POOL_BUDGET_DISABLED === 'true'
  ) {
    return { apply: false, env: {}, reason: 'disabled' };
  }

  if (!configPath) {
    return { apply: false, env: {}, reason: 'no-config-path' };
  }

  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return { apply: false, env: {}, reason: 'config-unreadable' };
  }

  if (!engineNeedsPoolBudget(config)) {
    return { apply: false, env: {}, reason: 'engine-skip' };
  }

  return {
    apply: true,
    env: resolvePoolBudgetEnv(env),
    reason: 'supabase-pool-budget',
  };
}

/**
 * @param {Record<string, string>} values
 * @returns {string}
 */
export function formatShellExports(values) {
  return Object.entries(values)
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n');
}

/**
 * @param {string} value
 * @returns {string}
 */
export function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function parseArgs(argv) {
  const args = {
    mode: 'shell',
    configPath: `${process.env.HOME ?? ''}/.gbrain/config.json`,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      args.mode = 'json';
    } else if (arg === '--shell') {
      args.mode = 'shell';
    } else if (arg === '--config' && argv[i + 1]) {
      args.configPath = argv[++i];
    } else if (!arg.startsWith('-')) {
      args.configPath = arg;
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const plan = planPoolBudget(args.configPath, process.env);

  if (args.mode === 'json') {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }

  if (plan.apply) {
    process.stdout.write(`${formatShellExports(plan.env)}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
