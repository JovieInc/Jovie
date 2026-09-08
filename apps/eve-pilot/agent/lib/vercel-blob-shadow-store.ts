import { BlobNotFoundError, get, head, list, put } from '@vercel/blob';
import type { ShadowRecord } from './summer-shadow-ingress';

const BLOB_OPERATION_TIMEOUT_MS = 8_000;
const MAX_RECORD_BYTES = 64 * 1024;

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

export async function readImmutableShadowRecord(
  pathname: string
): Promise<ShadowRecord | null> {
  const result = await get(pathname, {
    abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
    access: 'private',
    useCache: false,
  });
  if (!result) return null;
  if (
    result.statusCode !== 200 ||
    !result.stream ||
    result.blob.size > MAX_RECORD_BYTES
  ) {
    throw new Error('immutable shadow record is unavailable or oversized');
  }
  const text = await new Response(result.stream).text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RECORD_BYTES) {
    throw new Error('immutable shadow record is oversized');
  }
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('immutable shadow record is malformed');
  }
  return parsed as ShadowRecord;
}

export async function listImmutableShadowRecords(
  prefix: string,
  options: { readonly cursor?: string; readonly limit: number }
): Promise<{
  readonly cursor?: string;
  readonly entries: readonly { pathname: string; record: ShadowRecord }[];
  readonly hasMore: boolean;
  readonly scanned: number;
}> {
  const result = await list({
    abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
    ...(options.cursor ? { cursor: options.cursor } : {}),
    limit: options.limit,
    prefix,
  });
  const records: { pathname: string; record: ShadowRecord }[] = [];
  for (const blob of result.blobs) {
    try {
      const record = await readImmutableShadowRecord(blob.pathname);
      if (record) records.push({ pathname: blob.pathname, record });
    } catch {
      // One corrupt immutable object must not deny recovery for every later
      // event. The bottleneck loop still authenticates every returned item.
    }
  }
  if (result.hasMore && (!result.cursor || result.cursor === options.cursor)) {
    throw new Error('immutable shadow record pagination is invalid');
  }
  return {
    ...(result.cursor ? { cursor: result.cursor } : {}),
    entries: records,
    hasMore: result.hasMore,
    scanned: result.blobs.length,
  };
}

export async function persistShadowCursor(
  pathname: string,
  record: ShadowRecord
): Promise<void> {
  await put(pathname, JSON.stringify(record), {
    abortSignal: AbortSignal.timeout(BLOB_OPERATION_TIMEOUT_MS),
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    contentType: 'application/json; charset=utf-8',
  });
}
