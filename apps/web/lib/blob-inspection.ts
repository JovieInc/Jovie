/**
 * Shared Blob inspection for the audio and file upload verifiers.
 *
 * Fetches a blob's `head()` metadata, enforces that it lives under the
 * caller-supplied user-owned path prefix and within the surface's size limit,
 * then Range-fetches the leading bytes for a magic-byte sniff. Rejection
 * reasons stay domain-specific: callers pass callbacks that throw their own
 * typed verification errors.
 */

import { head } from '@vercel/blob';

export interface InspectedBlob {
  readonly pathname: string;
  readonly url: string;
  readonly size: number;
  readonly contentType?: string;
  readonly bytes: Uint8Array;
}

export async function inspectOwnedBlob(input: {
  readonly blobPathname: string;
  readonly expectedPathPrefix: string;
  readonly maxSizeBytes: number;
  readonly maxBytesToInspect: number;
  readonly onOwnershipError: () => never;
  readonly onInvalidSize: () => never;
  readonly onUnreadable: () => never;
}): Promise<InspectedBlob> {
  const metadata = await head(input.blobPathname);
  if (
    !metadata.pathname.startsWith(input.expectedPathPrefix) ||
    metadata.pathname !== input.blobPathname ||
    !metadata.url
  ) {
    input.onOwnershipError();
  }
  if (
    !Number.isSafeInteger(metadata.size) ||
    metadata.size <= 0 ||
    metadata.size > input.maxSizeBytes
  ) {
    input.onInvalidSize();
  }

  const response = await fetch(metadata.url, {
    headers: { Range: `bytes=0-${input.maxBytesToInspect - 1}` },
  });
  if (!response.ok) input.onUnreadable();

  return {
    pathname: metadata.pathname,
    url: metadata.url,
    size: metadata.size,
    contentType: metadata.contentType,
    bytes: new Uint8Array(await response.arrayBuffer()),
  };
}
