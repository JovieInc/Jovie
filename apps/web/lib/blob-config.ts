import 'server-only';

import { env } from '@/lib/env-server';

/**
 * Origin for dev/test mock blob URLs when Blob storage is not configured.
 * Must match the `*.blob.vercel-storage.com` next/image remote pattern: the
 * bare `blob.vercel-storage.com` host made next/image throw and crashed the
 * profile drawer after a press-photo upload.
 */
export const DEV_MOCK_BLOB_ORIGIN =
  'https://dev-mock.public.blob.vercel-storage.com';

export function buildDevMockBlobUrl(path: string): string {
  return `${DEV_MOCK_BLOB_ORIGIN}/${path.replace(/^\/+/, '')}`;
}

/**
 * True when Vercel Blob writes are possible: static BLOB_READ_WRITE_TOKEN
 * (local dev via Doppler / CI) or OIDC on Vercel (VERCEL_OIDC_TOKEN is
 * auto-injected; BLOB_STORE_ID is a project env var).
 */
export function isBlobStorageConfigured(): boolean {
  return Boolean(getBlobReadWriteToken() || env.BLOB_STORE_ID?.trim());
}

export function getBlobReadWriteToken(): string | undefined {
  const token = env.BLOB_READ_WRITE_TOKEN?.trim();
  return token || undefined;
}

export function getBlobCommandOptions(): { token?: string } {
  const token = getBlobReadWriteToken();
  return token ? { token } : {};
}
