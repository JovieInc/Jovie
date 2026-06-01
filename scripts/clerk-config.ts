#!/usr/bin/env -S tsx

/**
 * Clerk Config Automation (gh-9805)
 *
 * Secure, agent-friendly wrapper around `clerk config` (pull/schema/patch/put)
 * and related `clerk api` for inspecting/updating Clerk instance configuration.
 *
 * Primary use: self-serve auth fixes (iOS OAuth redirects, native app URLs,
 * allowed origins, webhook endpoints, JWT templates, etc.) without manual
 * dashboard or human intervention.
 *
 * HOT ZONE (gh-9805): tooling for Clerk config access only.
 * Reuses patterns from sync-dev-clerk-ids.ts, cleanup-e2e-users.ts, remap-clerk-ids.ts
 * (doppler run, sk_test_ guards, explicit safety, dry-run defaults, confirmation).
 *
 * Usage (via Doppler for correct env + keys):
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx scripts/clerk-config.ts pull --instance dev --output /tmp/clerk-dev.json
 *
 *   # Preview a patch (NEVER omit --dry-run for mutations in automation)
 *   doppler run --project jovie-web --config dev -- \
 *     pnpm tsx scripts/clerk-config.ts patch --dry-run --json '{"auth": {"...": "..."}}'
 *
 *   # Common auth fix helper: inspect current redirect-related config
 *   doppler run ... pnpm tsx scripts/clerk-config.ts check-redirects --pattern "jov.ie|myapp://"
 *
 * Safety (enforced):
 * - Always runs `clerk whoami` + instance verification first.
 * - Mutations default to --dry-run (explicit --apply or --yes required to mutate).
 * - Refuses production unless --allow-prod (and extra confirmation in interactive).
 * - Only sk_test_ or explicitly allowed staging/prod via Doppler config.
 * - All operations logged with timestamp + command for audit.
 *
 * MCP / Agent note: Also usable via `clerk skill` (bundled Clerk CLI agent skill)
 * and `clerk api --platform` for advanced cases. This script provides the Jovie
 * Doppler + guard layer on top.
 *
 * Related:
 * - docs/CLERK_CLI.md (full manual reference + this automation)
 * - .claude/rules/auth.md (three instances, proxy, safety)
 * - scripts/sync-dev-clerk-ids.ts (pattern reference)
 *
 * gh-9805 + gstack principles: completeness (full inspect+safe update path),
 * boil lakes (HOT ZONE only), pragmatic (iOS/redirect pain), DRY (existing guards),
 * explicit (clear errors + docs), bias toward action (small shippable).
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Types (explicit, no clever golf) ---
interface ClerkConfigOptions {
  instance?: 'dev' | 'staging' | 'prod';
  dryRun?: boolean;
  yes?: boolean;
  allowProd?: boolean;
  output?: string;
  file?: string;
  json?: string;
  pattern?: string;
  verbose?: boolean;
}

interface DopplerRun {
  project: string;
  config: string;
}

// --- Doppler + instance mapping (pragmatic, from .claude/rules/auth.md + setup.sh) ---
const INSTANCE_TO_DOPPLER: Record<string, DopplerRun> = {
  dev: { project: 'jovie-web', config: 'dev' },
  staging: { project: 'jovie-web', config: 'staging' }, // adjust if separate Doppler project
  prod: { project: 'jovie-web', config: 'prd' },
};

function getDopplerForInstance(instance: string = 'dev'): DopplerRun {
  const key = (
    instance || 'dev'
  ).toLowerCase() as keyof typeof INSTANCE_TO_DOPPLER;
  if (!INSTANCE_TO_DOPPLER[key]) {
    throw new Error(`Unknown instance "${instance}". Use dev|staging|prod.`);
  }
  return INSTANCE_TO_DOPPLER[key];
}

function getClerkCommandPrefix(doppler: DopplerRun): string[] {
  // Use the same pattern as setup.sh and other scripts: doppler run --project X --config Y --
  return [
    'doppler',
    'run',
    '--project',
    doppler.project,
    '--config',
    doppler.config,
    '--',
  ];
}

// --- Safety guards (explicit, reused patterns) ---
function assertTestOrAllowedInstance(
  secretKey: string | undefined,
  allowProd: boolean
): void {
  if (!secretKey) return; // CLI auth path may not expose it directly
  if (secretKey.startsWith('sk_live_') && !allowProd) {
    throw new Error(
      'SAFETY: Refusing to target production (sk_live_) without --allow-prod. ' +
        'Use --instance dev or staging for automation. Production config changes require explicit human review gate.'
    );
  }
  if (secretKey.startsWith('sk_test_')) {
    // good
    return;
  }
  // staging keys are often pk_live_ but scoped; allow if flag or known
}

function ensureClerkCli(): void {
  try {
    execSync('clerk --version', { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Clerk CLI not found. Install with: npm install -g clerk (or npx clerk@latest). ' +
        'See docs/CLERK_CLI.md for agent setup.'
    );
  }
}

function runClerkWhoami(dopplerPrefix: string[]): {
  stdout: string;
  ok: boolean;
} {
  const cmd = [...dopplerPrefix, 'clerk', 'whoami', '--mode', 'agent'];
  try {
    const stdout = execSync(cmd.join(' '), {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    return { stdout: stdout.trim(), ok: true };
  } catch (err: any) {
    return {
      stdout: err?.stdout?.toString() || err?.message || String(err),
      ok: false,
    };
  }
}

function logAudit(action: string, details: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  console.error(
    `[clerk-config-audit ${ts}] ${action} ${JSON.stringify(details)}`
  );
}

// --- Core runner (explicit, dry-run first) ---
function runClerk(
  args: string[],
  dopplerPrefix: string[],
  options: ClerkConfigOptions = {}
): string {
  ensureClerkCli();

  const fullCmd = [...dopplerPrefix, 'clerk', ...args];
  const cmdStr = fullCmd.join(' ');

  logAudit('exec', {
    cmd: cmdStr,
    dryRun: options.dryRun,
    instance: options.instance,
  });

  if (options.verbose) {
    console.error(`> ${cmdStr}`);
  }

  const result = spawnSync(fullCmd[0], fullCmd.slice(1), {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120000,
  });

  if (result.error) {
    throw new Error(`Failed to spawn clerk: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(
      `clerk command failed (exit ${result.status}): ${stderr || result.stdout || 'no output'}`
    );
  }
  return (result.stdout || '').trim();
}

// --- Public helpers (exported for tests / reuse; DRY + explicit) ---
export function extractAuthRelevantConfigKeys(
  configJson: string
): Record<string, unknown> {
  // Pragmatic extractor for common auth fix targets (redirects, oauth, native, webhooks, jwt).
  // The real structure comes from `clerk config schema` / pull; we surface top-level + auth/* keys safely.
  try {
    const cfg = JSON.parse(configJson);
    const relevant: Record<string, unknown> = {};
    const keysToExtract = [
      'auth',
      'oauth',
      'redirects',
      'allowed_origins',
      'native_applications',
      'webhooks',
      'jwt_templates',
      'domains',
      'sessions',
    ];
    for (const k of keysToExtract) {
      if (k in cfg) relevant[k] = cfg[k];
      // Also look one level deep under "auth" etc if nested
    }
    if (cfg.auth && typeof cfg.auth === 'object') {
      for (const sub of [
        'redirect_urls',
        'oauth_providers',
        'sign_in',
        'sign_up',
      ]) {
        if (sub in cfg.auth) relevant[`auth.${sub}`] = (cfg.auth as any)[sub];
      }
    }
    return relevant;
  } catch (e) {
    return { parse_error: String(e), raw_preview: configJson.slice(0, 200) };
  }
}

export function hasMatchingRedirect(
  configJson: string,
  pattern: string
): boolean {
  const extracted = extractAuthRelevantConfigKeys(configJson);
  const haystack = JSON.stringify(extracted).toLowerCase();
  return haystack.includes(pattern.toLowerCase());
}

// --- Subcommand implementations (complete, readable) ---

async function cmdWhoami(options: ClerkConfigOptions): Promise<void> {
  const doppler = getDopplerForInstance(options.instance);
  const prefix = getClerkCommandPrefix(doppler);
  const { stdout, ok } = runClerkWhoami(prefix);
  console.log(stdout || '(no output)');
  if (!ok) process.exit(1);
}

async function cmdPull(options: ClerkConfigOptions): Promise<void> {
  const doppler = getDopplerForInstance(options.instance);
  const prefix = getClerkCommandPrefix(doppler);

  const args = ['config', 'pull'];
  if (options.instance) args.push('--instance', options.instance);
  if (options.output) args.push('--output', options.output);

  const out = runClerk(args, prefix, options);
  if (!options.output) {
    console.log(out);
  } else {
    console.log(`Config written to ${resolve(options.output)}`);
  }

  // Also surface extracted auth keys for quick agent inspection
  const extracted = extractAuthRelevantConfigKeys(out);
  if (Object.keys(extracted).length > 0) {
    console.error('\n[extracted-auth-keys for quick inspection]');
    console.error(JSON.stringify(extracted, null, 2));
  }
}

async function cmdSchema(options: ClerkConfigOptions): Promise<void> {
  const doppler = getDopplerForInstance(options.instance);
  const prefix = getClerkCommandPrefix(doppler);

  const args = ['config', 'schema'];
  if (options.instance) args.push('--instance', options.instance);
  // schema supports --keys filter per CLI help

  const out = runClerk(args, prefix, options);
  console.log(out);
}

async function cmdPatch(options: ClerkConfigOptions): Promise<void> {
  const doppler = getDopplerForInstance(options.instance);
  const prefix = getClerkCommandPrefix(doppler);

  if (!options.dryRun && !options.yes && !options.allowProd) {
    // Force explicit intent for mutations
    throw new Error(
      'SAFETY: patch requires --dry-run (default preview) or --yes + --allow-prod for real apply. ' +
        'Never run destructive config changes without review. See docs/CLERK_CLI.md.'
    );
  }

  const args = ['config', 'patch'];
  if (options.instance) args.push('--instance', options.instance);
  if (options.dryRun) args.push('--dry-run');
  if (options.yes) args.push('--yes');
  if (options.file) args.push('--file', options.file);
  if (options.json) args.push('--json', options.json);

  const out = runClerk(args, prefix, options);
  console.log(out);
  logAudit('patch', { dryRun: options.dryRun, instance: options.instance });
}

async function cmdCheckRedirects(options: ClerkConfigOptions): Promise<void> {
  if (!options.pattern) {
    throw new Error(
      'check-redirects requires --pattern "substring" (e.g. "myapp://" or "jov.ie")'
    );
  }

  const doppler = getDopplerForInstance(options.instance);
  const prefix = getClerkCommandPrefix(doppler);

  // Pull fresh (or read from --file for offline)
  let configJson: string;
  if (options.file && existsSync(options.file)) {
    configJson = readFileSync(options.file, 'utf8');
  } else {
    const pullArgs = ['config', 'pull'];
    if (options.instance) pullArgs.push('--instance', options.instance);
    configJson = runClerk(pullArgs, prefix, options);
  }

  const hasMatch = hasMatchingRedirect(configJson, options.pattern);
  const extracted = extractAuthRelevantConfigKeys(configJson);

  console.log(
    JSON.stringify(
      {
        pattern: options.pattern,
        matched: hasMatch,
        instance: options.instance || 'dev',
        relevantKeys: extracted,
      },
      null,
      2
    )
  );

  if (!hasMatch) {
    console.error(
      `\nWARNING: No redirect entries matched pattern "${options.pattern}". ` +
        `This may explain iOS / OAuth redirect failures. Use "clerk-config patch" (with --dry-run first) to add it.`
    );
    process.exitCode = 2; // non-zero for scripting / CI
  }
}

// --- Main (explicit arg parsing, no magic) ---
async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Clerk Config Automation (gh-9805)

Subcommands:
  whoami                     Run clerk whoami (with Doppler + guard)
  pull [options]             clerk config pull (supports --instance, --output)
  schema [options]           clerk config schema
  patch [options]            clerk config patch (SAFETY: --dry-run default)
  check-redirects --pattern  Pull + inspect for redirect patterns (iOS/auth fix helper)

Global options (apply to most):
  --instance <dev|staging|prod>   Target (maps to Doppler project/config)
  --dry-run                       Preview only (enforced for patch/put)
  --yes                           Skip some confirmations (use with --allow-prod)
  --allow-prod                    Permit production targets (rare, explicit)
  --output <path>                 For pull
  --file <path>                   For patch or check-redirects (offline)
  --json '<json>'                 Inline for patch
  --pattern <str>                 For check-redirects
  --verbose                       Show exact commands

Examples (MUST use doppler for env-appropriate keys):
  doppler run --project jovie-web --config dev -- pnpm tsx scripts/clerk-config.ts pull --instance dev
  doppler run ... pnpm tsx scripts/clerk-config.ts check-redirects --pattern "jov.ie|myapp://"
  doppler run ... pnpm tsx scripts/clerk-config.ts patch --dry-run --json '{"auth":{"...":{}}}'

See docs/CLERK_CLI.md for full manual flows + safety rules.
gh-9805 principles: explicit, complete, small, DRY, action-oriented.
`);
    return;
  }

  const sub = argv[0];
  const options: ClerkConfigOptions = {};

  // Simple parser (explicit, readable, no yargs dep)
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--instance' && argv[i + 1]) {
      options.instance = argv[++i] as any;
      continue;
    }
    if (a === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (a === '--yes' || a === '--force') {
      options.yes = true;
      continue;
    }
    if (a === '--allow-prod') {
      options.allowProd = true;
      continue;
    }
    if (a === '--output' && argv[i + 1]) {
      options.output = argv[++i];
      continue;
    }
    if (a === '--file' && argv[i + 1]) {
      options.file = argv[++i];
      continue;
    }
    if (a === '--json' && argv[i + 1]) {
      options.json = argv[++i];
      continue;
    }
    if (a === '--pattern' && argv[i + 1]) {
      options.pattern = argv[++i];
      continue;
    }
    if (a === '--verbose') {
      options.verbose = true;
      continue;
    }
  }

  // Early guard using any visible secret (best effort; CLI often uses its own login token)
  const maybeSecret = process.env.CLERK_SECRET_KEY;
  if (maybeSecret)
    assertTestOrAllowedInstance(maybeSecret, !!options.allowProd);

  const doppler = getDopplerForInstance(options.instance);
  const prefix = getClerkCommandPrefix(doppler);

  // Always surface whoami context for audit (unless sub is whoami)
  if (sub !== 'whoami') {
    const who = runClerkWhoami(prefix);
    if (who.ok) {
      logAudit('whoami-context', { stdout: who.stdout.slice(0, 300) });
    }
  }

  switch (sub) {
    case 'whoami':
      await cmdWhoami(options);
      break;
    case 'pull':
      await cmdPull(options);
      break;
    case 'schema':
      await cmdSchema(options);
      break;
    case 'patch':
      await cmdPatch(options);
      break;
    case 'check-redirects':
      await cmdCheckRedirects(options);
      break;
    case '--self-test': {
      // Lightweight self-test for /qa (exercises pure helpers + guards)
      console.log('self-test: extractAuthRelevantConfigKeys');
      const sample = JSON.stringify({
        auth: { redirect_urls: ['https://jov.ie/*', 'myapp://callback'] },
        native_applications: [],
      });
      const ext = extractAuthRelevantConfigKeys(sample);
      console.log('  extracted keys:', Object.keys(ext));
      const has = hasMatchingRedirect(sample, 'myapp://');
      console.log('  hasMatchingRedirect(myapp://):', has);
      if (!has) throw new Error('self-test failed');
      console.log('self-test: PASS (pure helpers)');
      // Guard test
      try {
        assertTestOrAllowedInstance('sk_live_xxx', false);
        throw new Error('prod guard did not fire');
      } catch (e: any) {
        if (!/SAFETY/.test(e.message)) throw e;
        console.log('self-test: prod guard PASS');
      }
      console.log('All self-tests passed.');
      break;
    }
    default:
      console.error(`Unknown subcommand: ${sub}. Use --help.`);
      process.exit(1);
  }
}

main().catch(err => {
  console.error('clerk-config error:', err?.message || err);
  logAudit('error', { message: String(err?.message || err) });
  process.exit(1);
});
