import 'server-only';

import { serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';

const CLOUDFLARE_GRAPHQL_ENDPOINT =
  'https://api.cloudflare.com/client/v4/graphql';

export interface CloudflareGraphqlError {
  readonly message: string;
}

export interface CloudflareGraphqlResponse<TData> {
  readonly data?: TData;
  readonly errors?: readonly CloudflareGraphqlError[];
}

export function isCloudflareAnalyticsConfigured(): boolean {
  return Boolean(
    process.env.CLOUDFLARE_API_TOKEN?.trim() &&
      process.env.CLOUDFLARE_ZONE_ID?.trim()
  );
}

export function getCloudflareZoneId(): string | null {
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  return zoneId && zoneId.length > 0 ? zoneId : null;
}

export async function queryCloudflareGraphql<TData>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<TData> {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!apiToken) {
    throw new Error('CLOUDFLARE_API_TOKEN is not configured');
  }

  const response = await serverFetch(CLOUDFLARE_GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
    timeoutMs: 30_000,
    context: 'Cloudflare GraphQL analytics',
    retry: {
      maxRetries: 2,
      baseDelayMs: 500,
      maxDelayMs: 4_000,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Cloudflare GraphQL request failed (${response.status}): ${body.slice(0, 300)}`
    );
  }

  const payload = (await response.json()) as CloudflareGraphqlResponse<TData>;

  if (payload.errors?.length) {
    const message = payload.errors.map(error => error.message).join('; ');
    logger.error('[cloudflare/graphql] Query errors:', message);
    throw new Error(`Cloudflare GraphQL errors: ${message}`);
  }

  if (!payload.data) {
    throw new Error('Cloudflare GraphQL response missing data');
  }

  return payload.data;
}