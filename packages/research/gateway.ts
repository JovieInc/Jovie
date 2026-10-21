/**
 * Direct, capped provider calls for callers that need a specific endpoint
 * rather than routed research (a miner that needs Exa's index, a crawler
 * that needs Firecrawl batch scrape). Same credentials, api-client budget
 * ledger, per-source caps, metrics and optional response cache as the router.
 */
import { createHash } from 'node:crypto';

import type { ApiClient } from '@jovie/api-client';

import {
  cloudflareAccount,
  createProviderClients,
  type ProviderClients,
} from './credentials.ts';
import { ResearchState } from './state.ts';
import { SOURCES, type SourcesConfig } from './types.ts';

export const GATEWAY_SOURCES = ['exa', 'firecrawl', 'cloudflare'] as const;
export type GatewaySource = (typeof GATEWAY_SOURCES)[number];

export class CapExceeded extends Error {
  readonly exitCode = 75;
  constructor(source: string, cap: string) {
    super(`${source} cap reached: ${cap}`);
    this.name = 'CapExceeded';
  }
}

export interface SourceCallRequest {
  readonly method?: string;
  /** Path on the provider API, e.g. /search or /v1/batch/scrape. */
  readonly path: string;
  readonly body?: unknown;
  /** Billable units this call consumes (credits, pages); default the source's per-call units. */
  readonly units?: number;
  /** Serve an identical earlier response younger than this, at no cost. */
  readonly cacheTtlMs?: number;
  readonly caller?: string;
  /** Allow a retry after a transient failure (default: true for GET). */
  readonly idempotent?: boolean;
  readonly timeoutMs?: number;
}

export interface SourceCallResult {
  readonly status: number;
  readonly body: unknown;
  readonly usd: number;
  readonly cached: boolean;
}

/** Cost a provider reports in the response body, when it does. */
export function reportedUsd(source: string, body: unknown): number | undefined {
  if (source === 'exa') {
    const total = (body as { costDollars?: { total?: unknown } })?.costDollars
      ?.total;
    return typeof total === 'number' ? total : undefined;
  }
  return undefined;
}

async function baseUrl(
  source: GatewaySource,
  client: ApiClient
): Promise<string> {
  if (source === 'exa') return 'https://api.exa.ai';
  if (source === 'firecrawl') return 'https://api.firecrawl.dev';
  return `https://api.cloudflare.com/client/v4/accounts/${await cloudflareAccount(client)}`;
}

export function responseKey(
  source: string,
  method: string,
  path: string,
  body: unknown
): string {
  return createHash('sha256')
    .update([source, method, path, JSON.stringify(body ?? null)].join('\0'))
    .digest('hex')
    .slice(0, 24);
}

export async function callSource(
  deps: {
    state: ResearchState;
    clients: ProviderClients;
    config?: SourcesConfig;
  },
  source: GatewaySource,
  req: SourceCallRequest
): Promise<SourceCallResult> {
  const config = deps.config ?? SOURCES;
  // Cloudflare calls share the Browser Rendering budget row.
  const ledgerName = source === 'cloudflare' ? 'cloudflare-fetch' : source;
  const spec = config.sources[ledgerName];
  const client =
    source === 'cloudflare'
      ? await deps.clients.cloudflare()
      : source === 'exa'
        ? deps.clients.exa()
        : deps.clients.firecrawl();
  if (!client) throw new Error(`${source}: no credential on this host`);
  const method = (
    req.method ?? (req.body === undefined ? 'GET' : 'POST')
  ).toUpperCase();
  const key = responseKey(source, method, req.path, req.body);
  const started = Date.now();
  const log = (extra: Record<string, unknown>) =>
    deps.state.log({
      event: 'source-call',
      source,
      caller: req.caller ?? 'unknown',
      method,
      path: req.path,
      ms: Date.now() - started,
      ...extra,
    });

  if (req.cacheTtlMs) {
    const hit = await deps.state.getRaw(key, req.cacheTtlMs);
    if (hit !== null) {
      await log({ cache: 'hit', usd: 0, units: 0 });
      return { status: 200, body: hit, usd: 0, cached: true };
    }
  }

  const units = req.units ?? spec?.creditsPerCall ?? 1;
  const estimate = (spec?.usdPerCall ?? 0) * (spec?.creditsPerCall ? 1 : units);
  const blocked = await deps.state.reserve(
    ledgerName,
    spec?.caps,
    estimate,
    units
  );
  if (blocked) {
    await log({ cache: 'miss', blocked, usd: 0, units: 0 });
    throw new CapExceeded(source, blocked);
  }
  let response: Awaited<ReturnType<ApiClient['request']>>;
  try {
    response = await client.request({
      url: `${await baseUrl(source, client)}${req.path}`,
      method,
      headers:
        req.body === undefined
          ? undefined
          : { 'content-type': 'application/json' },
      body: req.body as object | string | undefined,
      write: false,
      idempotent: req.idempotent ?? method === 'GET',
      timeoutMs: req.timeoutMs ?? 30_000,
    });
  } catch (error) {
    await deps.state.settle(ledgerName, estimate, 0);
    await log({
      cache: 'miss',
      error: (error as Error).message.slice(0, 160),
      usd: 0,
      units,
    });
    throw error;
  }
  let body: unknown = response.text;
  try {
    body = JSON.parse(response.text);
  } catch {
    // non-JSON body stays text
  }
  const usd =
    reportedUsd(source, body) ?? (response.status < 400 ? estimate : 0);
  await deps.state.settle(ledgerName, estimate, usd);
  if (req.cacheTtlMs && response.status < 400)
    await deps.state.putRaw(key, body);
  await log({ cache: 'miss', status: response.status, usd, units });
  return { status: response.status, body, usd, cached: false };
}

/** Host-default dependencies for script callers (shared state dir, discovered credentials). */
export function gatewayDeps(): {
  state: ResearchState;
  clients: ProviderClients;
} {
  return { state: new ResearchState(), clients: createProviderClients() };
}
