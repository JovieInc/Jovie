#!/usr/bin/env -S tsx

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/**
 * SESSION_SECRET Doppler provisioning (JOV-2187).
 *
 * Anonymous onboarding chat at /start signs `jovie_onboarding_session` cookies
 * with HMAC-SHA256 keyed on SESSION_SECRET. When the secret is missing or
 * shorter than 32 characters, /api/chat returns 503 SESSION_SECRET_NOT_CONFIGURED
 * and /start cannot complete a first chat turn.
 *
 * Usage:
 *   pnpm tsx scripts/session-secret-config.ts check --target=all
 *   pnpm tsx scripts/session-secret-config.ts provision --target=stg --dry-run
 *   pnpm tsx scripts/session-secret-config.ts provision --target=all --yes --allow-prod
 *
 * Requires the Doppler CLI and auth for jovie-web stg/prd configs.
 */

export const DOPPLER_PROJECT = 'jovie-web';
export const SESSION_SECRET_MIN_LENGTH = 32;
export const SESSION_SECRET_ENV_KEY = 'SESSION_SECRET';

export const STAGING_DOPPLER_CONFIG = 'stg';
export const PRODUCTION_DOPPLER_CONFIG = 'prd';

export type SessionSecretTarget = 'stg' | 'prd' | 'all';
export type SessionSecretDopplerConfig =
  | typeof STAGING_DOPPLER_CONFIG
  | typeof PRODUCTION_DOPPLER_CONFIG;

export type SessionSecretStatus = 'ok' | 'missing' | 'too_short';

export interface SessionSecretCheckResult {
  readonly config: SessionSecretDopplerConfig;
  readonly status: SessionSecretStatus;
}

export interface SessionSecretConfigOptions {
  readonly target?: SessionSecretTarget;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly allowProd?: boolean;
}

export function isValidSessionSecret(
  value: string | undefined | null
): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length >= SESSION_SECRET_MIN_LENGTH
  );
}

export function generateSessionSecret(): string {
  return randomBytes(48).toString('base64url');
}

export function resolveProvisionTargets(
  target: SessionSecretTarget = 'prd'
): readonly SessionSecretDopplerConfig[] {
  switch (target) {
    case 'stg':
      return [STAGING_DOPPLER_CONFIG];
    case 'all':
      return [STAGING_DOPPLER_CONFIG, PRODUCTION_DOPPLER_CONFIG];
    case 'prd':
    default:
      return [PRODUCTION_DOPPLER_CONFIG];
  }
}

export function classifySessionSecret(
  config: SessionSecretDopplerConfig,
  value: string | undefined
): SessionSecretCheckResult {
  if (!value?.trim()) {
    return { config, status: 'missing' };
  }
  if (value.trim().length < SESSION_SECRET_MIN_LENGTH) {
    return { config, status: 'too_short' };
  }
  return { config, status: 'ok' };
}

export function configsNeedingProvision(
  results: readonly SessionSecretCheckResult[]
): SessionSecretDopplerConfig[] {
  return results
    .filter(result => result.status !== 'ok')
    .map(result => result.config);
}

function logAudit(action: string, details: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  console.error(
    `[session-secret-config-audit ${ts}] ${action} ${JSON.stringify(details)}`
  );
}

function ensureDopplerCli(): void {
  try {
    execFileSync('doppler', ['--version'], { stdio: 'ignore' });
  } catch {
    throw new Error(
      'Doppler CLI not found. Install from https://docs.doppler.com/docs/install-cli'
    );
  }
}

function readDopplerSecret(
  config: SessionSecretDopplerConfig
): string | undefined {
  try {
    const value = execFileSync(
      'doppler',
      [
        'secrets',
        'get',
        SESSION_SECRET_ENV_KEY,
        '--project',
        DOPPLER_PROJECT,
        '--config',
        config,
        '--plain',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    return value.trim();
  } catch {
    return undefined;
  }
}

function writeDopplerSecret(
  config: SessionSecretDopplerConfig,
  secret: string
): void {
  execFileSync(
    'doppler',
    [
      'secrets',
      'set',
      `${SESSION_SECRET_ENV_KEY}=${secret}`,
      '--project',
      DOPPLER_PROJECT,
      '--config',
      config,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
}

export function assertProdMutationAllowed(
  options: SessionSecretConfigOptions,
  configs: readonly SessionSecretDopplerConfig[]
): void {
  if (configs.includes(PRODUCTION_DOPPLER_CONFIG) && !options.allowProd) {
    throw new Error(
      'SAFETY: Refusing to mutate production Doppler config without --allow-prod.'
    );
  }
}

export async function cmdCheck(
  options: SessionSecretConfigOptions
): Promise<void> {
  ensureDopplerCli();
  const configs = resolveProvisionTargets(options.target ?? 'all');
  const results = configs.map(config =>
    classifySessionSecret(config, readDopplerSecret(config))
  );

  for (const result of results) {
    console.log(
      `${result.config} ${SESSION_SECRET_ENV_KEY}: ${result.status.toUpperCase()}`
    );
  }

  const needsProvision = configsNeedingProvision(results);
  if (needsProvision.length > 0) {
    console.error(
      `[session-secret-config] missing or invalid in: ${needsProvision.join(', ')}`
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    '[session-secret-config] all targets ready for /start onboarding chat'
  );
}

export async function cmdProvision(
  options: SessionSecretConfigOptions
): Promise<void> {
  ensureDopplerCli();
  const configs = resolveProvisionTargets(options.target ?? 'prd');
  assertProdMutationAllowed(options, configs);

  const dryRun = options.yes ? false : (options.dryRun ?? true);
  const results = configs.map(config =>
    classifySessionSecret(config, readDopplerSecret(config))
  );
  const targets = configsNeedingProvision(results);

  if (targets.length === 0) {
    console.log(
      '[session-secret-config] nothing to provision — all targets already valid'
    );
    return;
  }

  for (const config of targets) {
    const generated = generateSessionSecret();
    logAudit('provision-plan', {
      config,
      dryRun,
      secretLength: generated.length,
    });

    if (dryRun) {
      console.log(
        `[dry-run] would set ${SESSION_SECRET_ENV_KEY} in ${DOPPLER_PROJECT}/${config} (${generated.length} chars)`
      );
      continue;
    }

    writeDopplerSecret(config, generated);
    console.log(
      `Provisioned ${SESSION_SECRET_ENV_KEY} in ${DOPPLER_PROJECT}/${config}`
    );
  }

  if (dryRun) {
    console.log('[session-secret-config] re-run with --yes to apply');
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(`
SESSION_SECRET Doppler provisioning (JOV-2187)

Subcommands:
  check                        Verify SESSION_SECRET exists and is >= 32 chars
  provision [options]          Create missing/invalid secrets in Doppler

Options:
  --target <stg|prd|all>       Doppler config(s) to inspect or mutate (default: prd for provision, all for check)
  --dry-run                    Preview provision changes without writing (default)
  --yes                        Apply provision changes
  --allow-prod                 Permit production Doppler mutations

Examples:
  pnpm tsx scripts/session-secret-config.ts check --target=all
  pnpm tsx scripts/session-secret-config.ts provision --target=stg --yes
  pnpm tsx scripts/session-secret-config.ts provision --target=all --yes --allow-prod
`);
    return;
  }

  const sub = argv[0];
  const options: SessionSecretConfigOptions = {
    dryRun: true,
    target: sub === 'check' ? 'all' : 'prd',
  };

  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === '--target' && argv[index + 1]) {
      const value = argv[++index]!;
      if (!['stg', 'prd', 'all'].includes(value)) {
        throw new Error(`Invalid --target: ${value}`);
      }
      options.target = value as SessionSecretTarget;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--yes') {
      options.yes = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--allow-prod') {
      options.allowProd = true;
      continue;
    }
  }

  if (sub === 'provision') {
    assertProdMutationAllowed(options, resolveProvisionTargets(options.target));
  }

  switch (sub) {
    case 'check':
      await cmdCheck(options);
      break;
    case 'provision':
      await cmdProvision(options);
      break;
    default:
      throw new Error(`Unknown subcommand "${sub}". Run with --help.`);
  }
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('session-secret-config.ts');

if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
