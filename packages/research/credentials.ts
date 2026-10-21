/**
 * Credential discovery for research sources. Values are read, never logged:
 * every client identifies its budget bucket by hashCredential(), and errors
 * name only the variable or file that was missing.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  type ApiClient,
  createApiClient,
  hashCredential,
  type LedgerStore,
} from '@jovie/api-client';

const run = promisify(execFile);

/** Reads only the named keys from a dotenv file (e.g. ~/.hermes/.env). */
export function readDotenv(
  path: string,
  names: readonly string[]
): Record<string, string> {
  const out: Record<string, string> = {};
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || !names.includes(match[1])) continue;
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export interface CredentialEnv {
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
}

const defaults = (): CredentialEnv => ({ env: process.env, home: homedir() });

export function secretFor(
  name: string,
  ctx: CredentialEnv = defaults()
): string | null {
  const direct = ctx.env[name]?.trim();
  if (direct) return direct;
  const hermes = readDotenv(join(ctx.home, '.hermes', '.env'), [name])[name];
  return hermes?.trim() || null;
}

interface WranglerToken {
  token: string;
  expiresAt: number;
}

export function readWranglerToken(home = homedir()): WranglerToken | null {
  const path = join(
    home,
    'Library',
    'Preferences',
    '.wrangler',
    'config',
    'default.toml'
  );
  const alt = join(home, '.config', '.wrangler', 'config', 'default.toml');
  for (const file of [path, alt]) {
    try {
      const toml = readFileSync(file, 'utf8');
      const token = toml.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
      const exp = toml.match(/^expiration_time\s*=\s*"([^"]+)"/m)?.[1];
      if (token) return { token, expiresAt: exp ? Date.parse(exp) : 0 };
    } catch {
      // try the next location
    }
  }
  return null;
}

/** CLOUDFLARE_API_TOKEN first, else the wrangler OAuth login (refreshed by `wrangler whoami`). */
export async function cloudflareToken(
  ctx: CredentialEnv = defaults()
): Promise<string | null> {
  const direct = ctx.env.CLOUDFLARE_API_TOKEN?.trim();
  if (direct) return direct;
  let oauth = readWranglerToken(ctx.home);
  if (!oauth) return null;
  if (oauth.expiresAt - Date.now() < 60_000) {
    await run('wrangler', ['whoami'], { timeout: 30_000 }).catch(
      () => undefined
    );
    oauth = readWranglerToken(ctx.home);
  }
  return oauth && oauth.expiresAt > Date.now() ? oauth.token : null;
}

interface HyperagentBundle {
  access_token?: string;
  refresh_token?: string;
  client_id?: string;
  obtained_at?: number;
  expires_in?: number;
}

/** HYPERAGENT_MCP_TOKEN, else the CLI's OAuth bundle when still valid. */
export function hyperagentToken(
  ctx: CredentialEnv = defaults()
): string | null {
  const direct = ctx.env.HYPERAGENT_MCP_TOKEN?.trim();
  if (direct) return direct;
  try {
    const bundle = JSON.parse(
      readFileSync(
        join(ctx.home, '.config', 'hyperagent', 'mcp-oauth.json'),
        'utf8'
      )
    ) as HyperagentBundle;
    const expires = (bundle.obtained_at ?? 0) + (bundle.expires_in ?? 0);
    if (bundle.access_token && (!expires || Date.now() / 1000 < expires - 60)) {
      return bundle.access_token;
    }
  } catch {
    // no bundle
  }
  return null;
}

export interface ProviderClients {
  exa(): ApiClient | null;
  firecrawl(): ApiClient | null;
  perplexity(): ApiClient | null;
  gateway(): ApiClient | null;
  cloudflare(): Promise<ApiClient | null>;
  hyperagent(): ApiClient | null;
}

export function createProviderClients(
  options: {
    store?: LedgerStore;
    fetch?: typeof fetch;
    ctx?: CredentialEnv;
  } = {}
): ProviderClients {
  const ctx = options.ctx ?? defaults();
  const make = (
    provider: string,
    secret: string | null,
    header: (h: Headers, s: string) => void
  ) =>
    secret
      ? createApiClient({
          provider,
          credential: hashCredential(`jovie-research:${provider}`, secret),
          authorize: headers => header(headers, secret),
          store: options.store,
          fetch: options.fetch,
          log: () => undefined,
        })
      : null;
  const bearer = (h: Headers, s: string) =>
    h.set('authorization', `Bearer ${s}`);
  const memo = new Map<string, ApiClient | null>();
  const once = (key: string, build: () => ApiClient | null) => {
    if (!memo.has(key)) memo.set(key, build());
    return memo.get(key) ?? null;
  };
  return {
    exa: () =>
      once('exa', () =>
        make('exa', secretFor('EXA_API_KEY', ctx), (h, s) =>
          h.set('x-api-key', s)
        )
      ),
    firecrawl: () =>
      once('firecrawl', () =>
        make('firecrawl', secretFor('FIRECRAWL_API_KEY', ctx), bearer)
      ),
    perplexity: () =>
      once('perplexity', () =>
        make('perplexity', secretFor('PERPLEXITY_API_KEY', ctx), bearer)
      ),
    gateway: () =>
      once('gateway', () =>
        make('ai-gateway', secretFor('AI_GATEWAY_API_KEY', ctx), bearer)
      ),
    hyperagent: () =>
      once('hyperagent', () =>
        make('hyperagent', hyperagentToken(ctx), bearer)
      ),
    async cloudflare() {
      if (memo.has('cloudflare')) return memo.get('cloudflare') ?? null;
      const client = make('cloudflare', await cloudflareToken(ctx), bearer);
      memo.set('cloudflare', client);
      return client;
    },
  };
}

// ---- Cloudflare account discovery (cached per process) ----

let accountMemo: string | null = null;

export async function cloudflareAccount(client: ApiClient): Promise<string> {
  if (process.env.CLOUDFLARE_ACCOUNT_ID)
    return process.env.CLOUDFLARE_ACCOUNT_ID;
  if (accountMemo) return accountMemo;
  const response = await client.request({
    url: 'https://api.cloudflare.com/client/v4/accounts?per_page=5',
    cacheTtlMs: 7 * 86_400_000,
    priority: 'report',
  });
  const id = response.json<{ result?: { id: string }[] }>().result?.[0]?.id;
  if (!id) throw new Error('cloudflare: no account visible to this token');
  accountMemo = id;
  return id;
}
