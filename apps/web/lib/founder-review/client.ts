'use client';

import { upload } from '@vercel/blob/client';
import type {
  CreateFounderReviewInput,
  FounderReviewMedia,
  FounderReviewReceipt,
  FounderReviewTarget,
} from './contract';

interface FounderReviewApiResponse {
  readonly ok?: boolean;
  readonly error?: string;
  readonly receipt?: FounderReviewReceipt;
  readonly receipts?: FounderReviewReceipt[];
  readonly uploadPathPrefix?: string;
}

async function readResponse(
  response: Response
): Promise<FounderReviewApiResponse> {
  const body = (await response.json()) as FounderReviewApiResponse;
  if (!response.ok || !body.ok) {
    throw new Error(body.error ?? 'Founder review request failed');
  }
  return body;
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure file hashing is unavailable in this window');
  }
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    await file.arrayBuffer()
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

function extensionFor(contentType: FounderReviewMedia['contentType']): string {
  if (contentType === 'audio/mp4') return 'm4a';
  if (contentType === 'audio/ogg') return 'ogg';
  return 'webm';
}

export async function uploadFounderReviewAudio(input: {
  readonly sessionId: string;
  readonly segmentId: string;
  readonly blob: Blob;
  readonly contentType: FounderReviewMedia['contentType'];
  readonly durationMs: number;
  readonly target: FounderReviewTarget;
}): Promise<FounderReviewMedia> {
  const file = new File(
    [input.blob],
    `founder-review.${extensionFor(input.contentType)}`,
    { type: input.contentType }
  );
  const query = new URLSearchParams({
    sessionId: input.sessionId,
    segmentId: input.segmentId,
    targetType: input.target.type,
    targetId: input.target.id,
    sourceKind: input.target.sourceKind,
  });
  const state = await readResponse(
    await fetch('/api/inbox/founder-reviews', { cache: 'no-store' })
  );
  if (!state.uploadPathPrefix) {
    throw new Error('Founder review upload path missing');
  }
  const targetPath = [
    input.target.type,
    input.target.id,
    input.target.sourceKind,
  ]
    .map(value => encodeURIComponent(value))
    .join('/');
  const uploaded = await upload(
    `${state.uploadPathPrefix}${input.sessionId}/${input.segmentId}/${targetPath}/${file.name}`,
    file,
    {
      access: 'private',
      handleUploadUrl: `/api/inbox/founder-reviews/upload-token?${query}`,
    }
  );
  return {
    blobUrl: uploaded.url,
    pathname: uploaded.pathname,
    contentType: input.contentType,
    sha256: await sha256(file),
    byteSize: file.size,
    durationMs: input.durationMs,
  };
}

export async function createFounderReviewClient(
  review: CreateFounderReviewInput
): Promise<FounderReviewReceipt> {
  const response = await readResponse(
    await fetch('/api/inbox/founder-reviews', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jovie-pathname': globalThis.location?.pathname ?? '',
      },
      body: JSON.stringify(review),
    })
  );
  if (!response.receipt) throw new Error('Founder review receipt missing');
  return response.receipt;
}

export async function listFounderReviewReceipts(): Promise<
  FounderReviewReceipt[]
> {
  const response = await readResponse(
    await fetch('/api/inbox/founder-reviews', { cache: 'no-store' })
  );
  return response.receipts ?? [];
}

export async function deleteFounderReviewAudio(
  receiptId: string
): Promise<FounderReviewReceipt> {
  const response = await readResponse(
    await fetch(`/api/inbox/founder-reviews/${receiptId}/media`, {
      method: 'DELETE',
    })
  );
  if (!response.receipt) throw new Error('Founder review receipt missing');
  return response.receipt;
}

export async function updateFounderReviewActionOutcome(input: {
  readonly receiptId: string;
  readonly status: 'applied' | 'failed';
  readonly errorCode: string | null;
}): Promise<FounderReviewReceipt> {
  const response = await readResponse(
    await fetch(`/api/inbox/founder-reviews/${input.receiptId}/outcome`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: input.status,
        errorCode: input.errorCode,
      }),
    })
  );
  if (!response.receipt) throw new Error('Founder review receipt missing');
  return response.receipt;
}
