import { z } from 'zod';
import { RECORDABLE_VIDEO_KINDS } from '../types';

/**
 * Private teleprompter takes.
 *
 * Takes are raw face-to-camera footage, so they never use the public
 * account-video path (uploadRecordableVideo). Video and a server-written
 * metadata sidecar live under one owner prefix in private Vercel Blob,
 * readable only through the owner-checked media route.
 */
export const TELEPROMPTER_TAKE_SCHEMA_VERSION = 1 as const;
export const TELEPROMPTER_TAKE_MAX_BYTES = 750 * 1024 * 1024;
export const TELEPROMPTER_TAKE_MAX_DURATION_MS = 20 * 60 * 1000;
export const TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES = [
  'video/webm',
  'video/mp4',
] as const;
export const TELEPROMPTER_TAKE_UPLOAD_TOKEN_PATH =
  '/api/teleprompter/takes/upload-token';
export const TELEPROMPTER_TAKES_PATH = '/api/teleprompter/takes';

export type TeleprompterTakeContentType =
  (typeof TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES)[number];

const OWNER_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const TAKE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function isTeleprompterTakeId(value: string): boolean {
  return TAKE_ID.test(value);
}

export function teleprompterTakeBlobPrefix(ownerId: string): string {
  if (!OWNER_SEGMENT.test(ownerId)) {
    throw new Error('invalid-take-owner');
  }
  return `jovie/teleprompter/takes/${ownerId}/`;
}

export function teleprompterTakeExtension(
  contentType: TeleprompterTakeContentType
): 'webm' | 'mp4' {
  return contentType === 'video/mp4' ? 'mp4' : 'webm';
}

export function teleprompterTakeVideoPath(
  ownerId: string,
  takeId: string,
  contentType: TeleprompterTakeContentType
): string {
  if (!isTeleprompterTakeId(takeId)) throw new Error('invalid-take-id');
  return `${teleprompterTakeBlobPrefix(ownerId)}${takeId}.${teleprompterTakeExtension(contentType)}`;
}

export function teleprompterTakeMetadataPath(
  ownerId: string,
  takeId: string
): string {
  if (!isTeleprompterTakeId(takeId)) throw new Error('invalid-take-id');
  return `${teleprompterTakeBlobPrefix(ownerId)}${takeId}.json`;
}

/**
 * The upload token only signs `<prefix>/<uuid>.<webm|mp4>`, so a client can
 * never write metadata, overwrite another owner's take, or pick a path.
 */
export function isOwnedTakeVideoPath(
  ownerId: string,
  pathname: string
): boolean {
  let prefix: string;
  try {
    prefix = teleprompterTakeBlobPrefix(ownerId);
  } catch {
    return false;
  }
  if (!pathname.startsWith(prefix)) return false;
  const rest = pathname.slice(prefix.length);
  const match = /^([0-9a-f-]{36})\.(webm|mp4)$/.exec(rest);
  return Boolean(match?.[1] && isTeleprompterTakeId(match[1]));
}

export const TeleprompterTakeSourceSchema = z.enum(['script', 'answer']);
export type TeleprompterTakeSource = z.infer<
  typeof TeleprompterTakeSourceSchema
>;

export const SaveTeleprompterTakeSchema = z
  .object({
    takeId: z.string().regex(TAKE_ID),
    contentType: z.enum(TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES),
    byteSize: z.number().int().positive().max(TELEPROMPTER_TAKE_MAX_BYTES),
    durationMs: z
      .number()
      .int()
      .positive()
      .max(TELEPROMPTER_TAKE_MAX_DURATION_MS),
    takeNumber: z.number().int().min(1).max(999),
    title: z.string().trim().min(1).max(120),
    kind: z.enum(RECORDABLE_VIDEO_KINDS),
    source: TeleprompterTakeSourceSchema,
    script: z.string().trim().max(1200).optional(),
    question: z.string().trim().max(300).optional(),
    profileId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export type SaveTeleprompterTakeInput = z.infer<
  typeof SaveTeleprompterTakeSchema
>;

export const UpdateTeleprompterTakeSchema = z
  .object({ kept: z.boolean() })
  .strict();

export const TeleprompterTakeRecordSchema = z.object({
  schemaVersion: z.literal(TELEPROMPTER_TAKE_SCHEMA_VERSION),
  takeId: z.string().regex(TAKE_ID),
  videoPathname: z.string().min(1),
  contentType: z.enum(TELEPROMPTER_TAKE_ALLOWED_CONTENT_TYPES),
  byteSize: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  takeNumber: z.number().int().min(1),
  title: z.string().min(1),
  kind: z.enum(RECORDABLE_VIDEO_KINDS),
  source: TeleprompterTakeSourceSchema,
  script: z.string().optional(),
  question: z.string().optional(),
  profileId: z.string().optional(),
  kept: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type TeleprompterTakeRecord = z.infer<
  typeof TeleprompterTakeRecordSchema
>;

/** What the browser gets back. Paths stay server-side; media goes through the owner-checked route. */
export interface TeleprompterTakeSummary {
  readonly takeId: string;
  readonly takeNumber: number;
  readonly title: string;
  readonly kind: TeleprompterTakeRecord['kind'];
  readonly source: TeleprompterTakeSource;
  readonly question?: string;
  readonly durationMs: number;
  readonly kept: boolean;
  readonly createdAt: string;
  readonly mediaUrl: string;
}

export function teleprompterTakeMediaUrl(takeId: string): string {
  return `${TELEPROMPTER_TAKES_PATH}/${takeId}/media`;
}

export function toTeleprompterTakeSummary(
  record: TeleprompterTakeRecord
): TeleprompterTakeSummary {
  return {
    takeId: record.takeId,
    takeNumber: record.takeNumber,
    title: record.title,
    kind: record.kind,
    source: record.source,
    ...(record.question ? { question: record.question } : {}),
    durationMs: record.durationMs,
    kept: record.kept,
    createdAt: record.createdAt,
    mediaUrl: teleprompterTakeMediaUrl(record.takeId),
  };
}
