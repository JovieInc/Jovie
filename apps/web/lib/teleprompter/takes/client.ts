'use client';

import { uploadPresigned } from '@vercel/blob/client';
import {
  type SaveTeleprompterTakeInput,
  TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES,
  TELEPROMPTER_TAKE_UPLOAD_TOKEN_PATH,
  TELEPROMPTER_TAKES_PATH,
  type TeleprompterTakeContentType,
  type TeleprompterTakeSummary,
  teleprompterTakeVideoPath,
} from './contract';

export function resolveTakeContentType(
  mimeType: string
): TeleprompterTakeContentType {
  const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES as readonly string[]
  ).includes(base)
    ? (base as TeleprompterTakeContentType)
    : 'video/webm';
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = `take-request-failed-${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      // Non-JSON error body.
    }
    throw new Error(code);
  }
  return (await response.json()) as T;
}

export async function uploadTeleprompterTake(params: {
  readonly ownerId: string;
  readonly blob: Blob;
  readonly metadata: Omit<
    SaveTeleprompterTakeInput,
    'contentType' | 'byteSize'
  >;
}): Promise<TeleprompterTakeSummary> {
  const contentType = resolveTakeContentType(params.blob.type);
  const pathname = teleprompterTakeVideoPath(
    params.ownerId,
    params.metadata.takeId,
    contentType
  );
  await uploadPresigned(pathname, params.blob, {
    access: 'private',
    handleUploadUrl: TELEPROMPTER_TAKE_UPLOAD_TOKEN_PATH,
    contentType,
  });
  const body: SaveTeleprompterTakeInput = {
    ...params.metadata,
    contentType,
    byteSize: params.blob.size,
  };
  const response = await fetch(TELEPROMPTER_TAKES_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const { take } = await readJson<{ take: TeleprompterTakeSummary }>(response);
  return take;
}

export async function setTeleprompterTakeKeptClient(
  takeId: string,
  kept: boolean
): Promise<TeleprompterTakeSummary> {
  const response = await fetch(`${TELEPROMPTER_TAKES_PATH}/${takeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kept }),
  });
  const { take } = await readJson<{ take: TeleprompterTakeSummary }>(response);
  return take;
}

export async function deleteTeleprompterTakeClient(
  takeId: string
): Promise<void> {
  const response = await fetch(`${TELEPROMPTER_TAKES_PATH}/${takeId}`, {
    method: 'DELETE',
  });
  await readJson<{ ok: true }>(response);
}
