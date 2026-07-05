#!/usr/bin/env -S tsx

import { pathToFileURL } from 'node:url';

/**
 * Cloudflare Turnstile widget automation (JOV-2329).
 *
 * Manages Turnstile widget hostname allowlists via the Cloudflare API so
 * production /start no longer fails with client error 110200 (domain not
 * authorized).
 *
 * Usage (via Doppler for account + site key context):
 *   doppler run --project jovie-web --config prd -- \
 *     pnpm tsx scripts/turnstile-config.ts list
 *
 *   doppler run --project jovie-web --config prd -- \
 *     pnpm tsx scripts/turnstile-config.ts show
 *
 *   # Preview hostname additions (default)
 *   doppler run --project jovie-web --config prd -- \
 *     pnpm tsx scripts/turnstile-config.ts ensure-hostnames --dry-run
 *
 *   # Apply after review
 *   doppler run --project jovie-web --config prd -- \
 *     pnpm tsx scripts/turnstile-config.ts ensure-hostnames --yes --allow-prod
 *
 * Required env:
 *   CLOUDFLARE_API_TOKEN — API token with Turnstile Sites Read/Write
 *   CLOUDFLARE_ACCOUNT_ID — defaults to R2_ACCOUNT_ID when present
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — widget sitekey to inspect/update
 *
 * See docs/TURNSTILE_SETUP.md for dashboard fallback and token creation.
 */

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

export const PRODUCTION_TURNSTILE_HOSTNAMES = ['jov.ie', 'www.jov.ie'] as const;

export const STAGING_TURNSTILE_HOSTNAMES = [
  'staging.jov.ie',
  'main.jov.ie',
] as const;

export type TurnstileHostnameTarget = 'prod' | 'staging' | 'all';

export interface TurnstileWidget {
  readonly sitekey: string;
  readonly name?: string;
  readonly mode?: string;
  readonly domains: readonly string[];
  readonly clearance_level?: string;
}

export interface TurnstileConfigOptions {
  readonly accountId?: string;
  readonly siteKey?: string;
  readonly apiToken?: string;
  readonly dryRun?: boolean;
  readonly yes?: boolean;
  readonly allowProd?: boolean;
  readonly target?: TurnstileHostnameTarget;
  readonly verbose?: boolean;
}

interface CloudflareApiResponse<T> {
  readonly success: boolean;
  readonly errors?: readonly { code?: number; message?: string }[];
  readonly result?: T;
}

function logAudit(action: string, details: Record<string, unknown>): void {
  const ts = new Date().toISOString();
  console.error(
    `[turnstile-config-audit ${ts}] ${action} ${JSON.stringify(details)}`
  );
}

export function resolveHostnameTarget(
  target: TurnstileHostnameTarget = 'prod'
): readonly string[] {
  switch (target) {
    case 'staging':
      return STAGING_TURNSTILE_HOSTNAMES;
    case 'all':
      return [
        ...PRODUCTION_TURNSTILE_HOSTNAMES,
        ...STAGING_TURNSTILE_HOSTNAMES,
      ];
    case 'prod':
    default:
      return PRODUCTION_TURNSTILE_HOSTNAMES;
  }
}

export function mergeHostnameAllowlist(
  existingDomains: readonly string[],
  requiredHostnames: readonly string[]
): string[] {
  const merged = new Set(
    existingDomains.map(domain => domain.trim().toLowerCase())
  );
  for (const hostname of requiredHostnames) {
    merged.add(hostname.trim().toLowerCase());
  }
  return [...merged].sort();
}

export function missingHostnames(
  existingDomains: readonly string[],
  requiredHostnames: readonly string[]
): string[] {
  const existing = new Set(
    existingDomains.map(domain => domain.trim().toLowerCase())
  );
  return requiredHostnames.filter(
    hostname => !existing.has(hostname.toLowerCase())
  );
}

function getApiToken(options: TurnstileConfigOptions): string {
  const token = options.apiToken ?? process.env.CLOUDFLARE_API_TOKEN;
  if (!token?.trim()) {
    throw new Error(
      'CLOUDFLARE_API_TOKEN is required. Create a token with Turnstile Sites Read/Write ' +
        'in the Cloudflare dashboard and store it in Doppler (jovie-web/prd). ' +
        'See docs/TURNSTILE_SETUP.md.'
    );
  }
  return token.trim();
}

function getAccountId(options: TurnstileConfigOptions): string {
  const accountId =
    options.accountId ??
    process.env.CLOUDFLARE_ACCOUNT_ID ??
    process.env.R2_ACCOUNT_ID;
  if (!accountId?.trim()) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID (or R2_ACCOUNT_ID) is required to call the Turnstile API.'
    );
  }
  return accountId.trim();
}

function getSiteKey(options: TurnstileConfigOptions): string {
  const siteKey = options.siteKey ?? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey?.trim()) {
    throw new Error(
      'NEXT_PUBLIC_TURNSTILE_SITE_KEY is required. Load via Doppler for the target environment.'
    );
  }
  return siteKey.trim();
}

async function cloudflareRequest<T>(
  path: string,
  options: TurnstileConfigOptions,
  init?: RequestInit
): Promise<T> {
  const token = getApiToken(options);
  const response = await fetch(`${CLOUDFLARE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const payload = (await response.json()) as CloudflareApiResponse<T>;
  if (!response.ok || !payload.success) {
    const message =
      payload.errors?.map(error => error.message).join('; ') ||
      `HTTP ${response.status}`;
    throw new Error(`Cloudflare API error: ${message}`);
  }

  if (payload.result === undefined) {
    throw new Error(
      'Cloudflare API returned success without a result payload.'
    );
  }

  return payload.result;
}

function normalizeWidget(raw: Record<string, unknown>): TurnstileWidget {
  const domains = Array.isArray(raw.domains)
    ? raw.domains.filter(
        (domain): domain is string => typeof domain === 'string'
      )
    : [];

  return {
    sitekey:
      typeof raw.sitekey === 'string'
        ? raw.sitekey
        : typeof raw.id === 'string'
          ? raw.id
          : '',
    name: typeof raw.name === 'string' ? raw.name : undefined,
    mode: typeof raw.mode === 'string' ? raw.mode : undefined,
    domains,
    clearance_level:
      typeof raw.clearance_level === 'string' ? raw.clearance_level : undefined,
  };
}

export async function listTurnstileWidgets(
  options: TurnstileConfigOptions = {}
): Promise<TurnstileWidget[]> {
  const accountId = getAccountId(options);
  const result = await cloudflareRequest<Record<string, unknown>[]>(
    `/accounts/${accountId}/challenges/widgets`,
    options,
    { method: 'GET' }
  );

  return result.map(widget => normalizeWidget(widget));
}

export async function getTurnstileWidget(
  options: TurnstileConfigOptions = {}
): Promise<TurnstileWidget> {
  const accountId = getAccountId(options);
  const siteKey = getSiteKey(options);
  const result = await cloudflareRequest<Record<string, unknown>>(
    `/accounts/${accountId}/challenges/widgets/${siteKey}`,
    options,
    { method: 'GET' }
  );
  return normalizeWidget(result);
}

export async function updateTurnstileWidgetDomains(
  widget: TurnstileWidget,
  domains: readonly string[],
  options: TurnstileConfigOptions = {}
): Promise<TurnstileWidget> {
  const accountId = getAccountId(options);
  const body = {
    domains: [...domains],
    ...(widget.name ? { name: widget.name } : {}),
    ...(widget.mode ? { mode: widget.mode } : {}),
    ...(widget.clearance_level
      ? { clearance_level: widget.clearance_level }
      : {}),
  };

  const result = await cloudflareRequest<Record<string, unknown>>(
    `/accounts/${accountId}/challenges/widgets/${widget.sitekey}`,
    options,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );

  return normalizeWidget(result);
}

export async function ensureTurnstileHostnames(
  options: TurnstileConfigOptions = {}
): Promise<{
  readonly changed: boolean;
  readonly widget: TurnstileWidget;
  readonly added: readonly string[];
  readonly domains: readonly string[];
}> {
  const required = resolveHostnameTarget(options.target);
  const widget = await getTurnstileWidget(options);
  const added = missingHostnames(widget.domains, required);
  const domains = mergeHostnameAllowlist(widget.domains, required);

  if (added.length === 0) {
    return { changed: false, widget, added, domains: widget.domains };
  }

  if (options.dryRun || !options.yes) {
    return { changed: true, widget, added, domains };
  }

  const updated = await updateTurnstileWidgetDomains(widget, domains, options);
  return { changed: true, widget: updated, added, domains: updated.domains };
}

async function cmdList(options: TurnstileConfigOptions): Promise<void> {
  const widgets = await listTurnstileWidgets(options);
  console.log(JSON.stringify(widgets, null, 2));
}

async function cmdShow(options: TurnstileConfigOptions): Promise<void> {
  const widget = await getTurnstileWidget(options);
  console.log(JSON.stringify(widget, null, 2));
}

async function cmdEnsureHostnames(
  options: TurnstileConfigOptions
): Promise<void> {
  const required = resolveHostnameTarget(options.target);
  const result = await ensureTurnstileHostnames(options);

  const payload = {
    sitekey: result.widget.sitekey,
    target: options.target ?? 'prod',
    required,
    currentDomains: result.widget.domains,
    added: result.added,
    nextDomains: result.domains,
    dryRun: Boolean(options.dryRun || !options.yes),
    applied: result.changed && !options.dryRun && Boolean(options.yes),
  };

  console.log(JSON.stringify(payload, null, 2));

  if (result.added.length === 0) {
    console.error('✅ Required hostnames are already present on the widget.');
    return;
  }

  if (options.dryRun || !options.yes) {
    console.error(
      `DRY RUN: would add hostnames: ${result.added.join(', ')}. ` +
        'Re-run with --yes to apply.'
    );
    process.exitCode = 2;
    return;
  }

  logAudit('ensure-hostnames', {
    sitekey: result.widget.sitekey,
    added: result.added,
    domains: result.domains,
  });
  console.error(
    `✅ Updated widget hostnames. Added: ${result.added.join(', ')}`
  );
}

function assertProdMutationAllowed(options: TurnstileConfigOptions): void {
  const target = options.target ?? 'prod';
  const touchesProd = target === 'prod' || target === 'all';
  if (touchesProd && !options.allowProd) {
    throw new Error(
      'SAFETY: production hostname changes require --allow-prod. ' +
        'Preview with --dry-run first.'
    );
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(`
Cloudflare Turnstile widget automation (JOV-2329)

Subcommands:
  list                         List all Turnstile widgets for the account
  show                         Show the widget referenced by NEXT_PUBLIC_TURNSTILE_SITE_KEY
  ensure-hostnames [options]   Add required Jovie hostnames to the active widget

Options:
  --target <prod|staging|all>  Hostname set to enforce (default: prod)
  --dry-run                    Preview changes without applying (default for mutations)
  --yes                        Apply hostname updates
  --allow-prod                 Permit production hostname mutations
  --account-id <id>            Override CLOUDFLARE_ACCOUNT_ID / R2_ACCOUNT_ID
  --site-key <key>             Override NEXT_PUBLIC_TURNSTILE_SITE_KEY
  --verbose                    Reserved for future verbose logging

Examples:
  doppler run --project jovie-web --config prd -- \\
    pnpm tsx scripts/turnstile-config.ts show

  doppler run --project jovie-web --config prd -- \\
    pnpm tsx scripts/turnstile-config.ts ensure-hostnames --dry-run

  doppler run --project jovie-web --config prd -- \\
    pnpm tsx scripts/turnstile-config.ts ensure-hostnames --yes --allow-prod
`);
    return;
  }

  const sub = argv[0];
  const options: TurnstileConfigOptions = {
    dryRun: true,
    target: 'prod',
  };

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--target' && argv[i + 1]) {
      options.target = argv[++i] as TurnstileHostnameTarget;
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
    if (arg === '--account-id' && argv[i + 1]) {
      options.accountId = argv[++i];
      continue;
    }
    if (arg === '--site-key' && argv[i + 1]) {
      options.siteKey = argv[++i];
      continue;
    }
    if (arg === '--verbose') {
      options.verbose = true;
      continue;
    }
  }

  if (sub === 'ensure-hostnames') {
    assertProdMutationAllowed(options);
  }

  switch (sub) {
    case 'list':
      await cmdList(options);
      break;
    case 'show':
      await cmdShow(options);
      break;
    case 'ensure-hostnames':
      await cmdEnsureHostnames(options);
      break;
    default:
      throw new Error(`Unknown subcommand "${sub}". Run with --help.`);
  }
}

const isMain =
  import.meta.url === pathToFileURL(process.argv[1] ?? '').href ||
  process.argv[1]?.endsWith('turnstile-config.ts');

if (isMain) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
