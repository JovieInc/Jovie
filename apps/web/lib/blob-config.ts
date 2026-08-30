import 'server-only';

import { env } from '@/lib/env-server';

/**
 * True when Vercel Blob writes are possible: static BLOB_READ_WRITE_TOKEN
 * (local dev via Doppler / CI) or OIDC on Vercel (VERCEL_OIDC_TOKEN is
 * auto-injected; BLOB_STORE_ID is a project env var).
 */
export function isBlobStorageConfigured(): boolean {
  return Boolean(env.BLOB_READ_WRITE_TOKEN) || Boolean(env.BLOB_STORE_ID);
}
