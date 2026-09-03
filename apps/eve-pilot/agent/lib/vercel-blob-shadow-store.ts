import { BlobNotFoundError, head, put } from '@vercel/blob';
import type { ShadowRecord } from './summer-shadow-ingress';

const BLOB_OPERATION_TIMEOUT_MS = 8_000;

async function blobExists(pathname: string): Promise<boolean> {
  try {
    await head(pathname, {
      abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
    });
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return false;
    throw error;
  }
}

/**
 * Creates one private immutable receipt. If the put result is uncertain, a
 * bounded metadata read classifies an already-created blob as an existing
 * receipt so the ingress fails closed instead of dispatching twice.
 */
export async function persistImmutableShadowRecord(
  pathname: string,
  record: ShadowRecord
): Promise<'created' | 'exists'> {
  try {
    await put(pathname, JSON.stringify(record), {
      abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 60,
      contentType: 'application/json; charset=utf-8',
    });
    return 'created';
  } catch (putError) {
    try {
      if (await blobExists(pathname)) return 'exists';
    } catch {
      // Preserve the original write failure. A secondary read failure cannot
      // prove that a receipt exists or that it is safe to dispatch.
    }
    throw putError;
  }
}
