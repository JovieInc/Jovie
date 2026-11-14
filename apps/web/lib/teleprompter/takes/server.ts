import 'server-only';

import { del, get, head, list, put } from '@vercel/blob';
import { getBlobCommandOptions } from '@/lib/blob-config';
import {
  type SaveTeleprompterTakeInput,
  TELEPROMPTER_TAKE_SCHEMA_VERSION,
  type TeleprompterTakeRecord,
  TeleprompterTakeRecordSchema,
  teleprompterTakeBlobPrefix,
  teleprompterTakeMetadataPath,
  teleprompterTakeVideoPath,
} from './contract';

export class TeleprompterTakeError extends Error {
  constructor(
    readonly code: string,
    readonly status: number
  ) {
    super(code);
    this.name = 'TeleprompterTakeError';
  }
}

async function readRecord(
  pathname: string
): Promise<TeleprompterTakeRecord | null> {
  const blob = await get(pathname, {
    access: 'private',
    useCache: false,
    ...getBlobCommandOptions(),
  });
  if (!blob || blob.statusCode !== 200 || !blob.stream) return null;
  const text = await new Response(blob.stream).text();
  try {
    const parsed = TeleprompterTakeRecordSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeRecord(
  ownerId: string,
  record: TeleprompterTakeRecord
): Promise<void> {
  await put(
    teleprompterTakeMetadataPath(ownerId, record.takeId),
    JSON.stringify(record),
    {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      ...getBlobCommandOptions(),
    }
  );
}

/**
 * Records a take after its video upload finished. The video must already
 * exist at the owner's path with the declared type and size; the server
 * writes the sidecar, so a client never authors stored metadata paths.
 */
export async function saveTeleprompterTake(
  ownerId: string,
  input: SaveTeleprompterTakeInput,
  now: Date = new Date()
): Promise<TeleprompterTakeRecord> {
  const videoPathname = teleprompterTakeVideoPath(
    ownerId,
    input.takeId,
    input.contentType
  );
  const uploaded = await head(videoPathname, getBlobCommandOptions()).catch(
    () => null
  );
  if (!uploaded || uploaded.pathname !== videoPathname) {
    throw new TeleprompterTakeError('take-video-missing', 422);
  }
  if (uploaded.size !== input.byteSize) {
    throw new TeleprompterTakeError('take-video-size-mismatch', 422);
  }
  const existing = await readRecord(
    teleprompterTakeMetadataPath(ownerId, input.takeId)
  );
  const timestamp = now.toISOString();
  const record: TeleprompterTakeRecord = {
    schemaVersion: TELEPROMPTER_TAKE_SCHEMA_VERSION,
    takeId: input.takeId,
    videoPathname,
    contentType: input.contentType,
    byteSize: input.byteSize,
    durationMs: input.durationMs,
    takeNumber: input.takeNumber,
    title: input.title,
    kind: input.kind,
    source: input.source,
    ...(input.script ? { script: input.script } : {}),
    ...(input.question ? { question: input.question } : {}),
    ...(input.profileId ? { profileId: input.profileId } : {}),
    kept: existing?.kept ?? false,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  await writeRecord(ownerId, record);
  return record;
}

export async function loadOwnedTeleprompterTake(
  ownerId: string,
  takeId: string
): Promise<TeleprompterTakeRecord> {
  let pathname: string;
  try {
    pathname = teleprompterTakeMetadataPath(ownerId, takeId);
  } catch {
    throw new TeleprompterTakeError('take-not-found', 404);
  }
  const record = await readRecord(pathname);
  if (!record || record.takeId !== takeId) {
    throw new TeleprompterTakeError('take-not-found', 404);
  }
  if (!record.videoPathname.startsWith(teleprompterTakeBlobPrefix(ownerId))) {
    throw new TeleprompterTakeError('take-not-found', 404);
  }
  return record;
}

export async function setTeleprompterTakeKept(
  ownerId: string,
  takeId: string,
  kept: boolean,
  now: Date = new Date()
): Promise<TeleprompterTakeRecord> {
  const record = await loadOwnedTeleprompterTake(ownerId, takeId);
  const updated = { ...record, kept, updatedAt: now.toISOString() };
  await writeRecord(ownerId, updated);
  return updated;
}

export async function deleteTeleprompterTake(
  ownerId: string,
  takeId: string
): Promise<void> {
  const record = await loadOwnedTeleprompterTake(ownerId, takeId);
  await del(
    [record.videoPathname, teleprompterTakeMetadataPath(ownerId, takeId)],
    getBlobCommandOptions()
  );
}

/** Newest first. Capped so one listing never fans out unbounded reads. */
export async function listTeleprompterTakes(
  ownerId: string,
  limit = 50
): Promise<TeleprompterTakeRecord[]> {
  const prefix = teleprompterTakeBlobPrefix(ownerId);
  const metadata: { pathname: string; uploadedAt: Date; takeKey: string }[] =
    [];
  // Keeping a take rewrites its sidecar, so order by the video upload, which
  // never changes, to keep the newest takes inside the limit.
  const videoUploadedAt = new Map<string, number>();
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      ...getBlobCommandOptions(),
    });
    for (const blob of page.blobs) {
      const takeKey = blob.pathname.replace(/\.[^./]+$/, '');
      if (blob.pathname.endsWith('.json')) {
        metadata.push({
          pathname: blob.pathname,
          uploadedAt: blob.uploadedAt,
          takeKey,
        });
      } else {
        videoUploadedAt.set(takeKey, blob.uploadedAt.getTime());
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const createdAt = (entry: (typeof metadata)[number]) =>
    videoUploadedAt.get(entry.takeKey) ?? entry.uploadedAt.getTime();
  metadata.sort((a, b) => createdAt(b) - createdAt(a));
  const records = await Promise.all(
    metadata.slice(0, limit).map(entry => readRecord(entry.pathname))
  );
  return records
    .filter((record): record is TeleprompterTakeRecord => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function openTeleprompterTakeMedia(
  ownerId: string,
  takeId: string,
  range: string | null
) {
  const record = await loadOwnedTeleprompterTake(ownerId, takeId);
  const blob = await get(record.videoPathname, {
    access: 'private',
    useCache: false,
    ...(range ? { headers: { Range: range } } : {}),
    ...getBlobCommandOptions(),
  });
  if (!blob || blob.statusCode !== 200 || !blob.stream) {
    throw new TeleprompterTakeError('take-media-unavailable', 404);
  }
  return blob;
}
