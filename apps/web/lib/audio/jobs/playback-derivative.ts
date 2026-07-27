import type { AudioPlaybackDerivative } from '@jovie/audio-contracts';
import { del, get, put } from '@vercel/blob';
import { and, sql as drizzleSql, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DbOrTransaction } from '@/lib/db';
import { discogRecordings } from '@/lib/db/schema/content';
import type { ingestionJobs } from '@/lib/db/schema/ingestion';
import { env } from '@/lib/env-server';
import { logger } from '@/lib/utils/logger';
import {
  AudioDerivativeConversionError,
  MAX_AUDIO_DERIVATIVE_BYTES,
  prepareAiffPlaybackDerivative,
} from '../aiff-to-wav';
import { parseAudioPlaybackDerivative } from '../playback-derivative';

const AUDIO_DERIVATIVE_TIMEOUT_MS = 240_000;

export const audioPlaybackDerivativePayloadSchema = z.object({
  recordingId: z.string().uuid(),
  creatorProfileId: z.string().uuid(),
  formatId: z.literal('aiff'),
  generation: z.number().int().positive(),
});

class AudioDerivativeJobError extends Error {
  constructor(
    readonly reason:
      | 'invalid_source'
      | 'conversion_failed'
      | 'resource_limit'
      | 'storage_failed',
    message: string
  ) {
    super(message);
    this.name = 'AudioDerivativeJobError';
  }
}

function safeJobError(error: unknown): AudioDerivativeJobError {
  if (error instanceof AudioDerivativeJobError) return error;
  if (error instanceof AudioDerivativeConversionError) {
    return new AudioDerivativeJobError(error.code, error.message);
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return new AudioDerivativeJobError(
      'resource_limit',
      'Audio derivative processing timed out'
    );
  }
  return new AudioDerivativeJobError(
    'conversion_failed',
    'Audio derivative processing failed'
  );
}

function safeStorageError(
  error: unknown,
  message: string
): AudioDerivativeJobError | AudioDerivativeConversionError | Error {
  if (
    error instanceof AudioDerivativeConversionError ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return error;
  }
  return new AudioDerivativeJobError('storage_failed', message);
}

async function writeDerivativeState(
  tx: DbOrTransaction,
  input: {
    readonly creatorProfileId: string;
    readonly derivative: AudioPlaybackDerivative;
    readonly previewUrl?: string;
    readonly recordingId: string;
  }
) {
  const [updated] = await tx
    .update(discogRecordings)
    .set({
      metadata: drizzleSql`jsonb_set(
        coalesce(${discogRecordings.metadata}, '{}'::jsonb),
        '{audioPlaybackDerivative}',
        ${JSON.stringify(input.derivative)}::jsonb,
        true
      )`,
      ...(input.previewUrl ? { previewUrl: input.previewUrl } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(discogRecordings.id, input.recordingId),
        eq(discogRecordings.creatorProfileId, input.creatorProfileId),
        drizzleSql`${discogRecordings.metadata} -> 'audioPlaybackDerivative' ->> 'generation' = ${String(input.derivative.generation)}`
      )
    )
    .returning({ id: discogRecordings.id });
  return Boolean(updated);
}

export async function processAudioPlaybackDerivativeJob(
  tx: DbOrTransaction,
  job: typeof ingestionJobs.$inferSelect
): Promise<void> {
  const payload = audioPlaybackDerivativePayloadSchema.parse(job.payload);
  const startedAt = Date.now();
  const queueDelayMs = Math.max(0, startedAt - job.createdAt.getTime());
  const [recording] = await tx
    .select({
      audioFormat: discogRecordings.audioFormat,
      audioUrl: discogRecordings.audioUrl,
      metadata: discogRecordings.metadata,
    })
    .from(discogRecordings)
    .where(
      and(
        eq(discogRecordings.id, payload.recordingId),
        eq(discogRecordings.creatorProfileId, payload.creatorProfileId)
      )
    )
    .limit(1);

  if (!recording) return;
  const currentDerivative = parseAudioPlaybackDerivative(recording.metadata);
  if (
    !currentDerivative ||
    currentDerivative.generation !== payload.generation ||
    currentDerivative.sourceFormatId !== payload.formatId ||
    !['pending', 'retrying'].includes(currentDerivative.status)
  ) {
    return;
  }

  const token = env.BLOB_READ_WRITE_TOKEN;
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    AUDIO_DERIVATIVE_TIMEOUT_MS
  );
  let uploadedUrl: string | null = null;
  let derivativeCommitted = false;

  try {
    if (!recording.audioUrl || recording.audioFormat !== 'audio/aiff') {
      throw new AudioDerivativeJobError(
        'invalid_source',
        'Audio derivative source is missing or changed'
      );
    }
    if (!token) {
      throw new AudioDerivativeJobError(
        'storage_failed',
        'Audio derivative storage is not configured'
      );
    }

    const source = await get(recording.audioUrl, {
      access: 'public',
      token,
      abortSignal: controller.signal,
    }).catch(error => {
      throw safeStorageError(
        error,
        'Audio derivative source could not be read'
      );
    });
    if (!source || source.statusCode !== 200) {
      throw new AudioDerivativeJobError(
        'storage_failed',
        'Audio derivative source could not be read'
      );
    }
    if (source.blob.size > MAX_AUDIO_DERIVATIVE_BYTES) {
      throw new AudioDerivativeJobError(
        'resource_limit',
        'Audio derivative source exceeds the processing limit'
      );
    }

    const prepared = await prepareAiffPlaybackDerivative(source.stream);
    const pathname = `audio-derivatives/${payload.recordingId}/playback-${payload.generation}.wav`;
    const uploaded = await put(pathname, prepared.stream, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
      contentType: 'audio/wav',
      maximumSizeInBytes: MAX_AUDIO_DERIVATIVE_BYTES,
      multipart: true,
      token,
      abortSignal: controller.signal,
    }).catch(error => {
      throw safeStorageError(error, 'Audio derivative could not be stored');
    });
    uploadedUrl = uploaded.url;

    const ready: AudioPlaybackDerivative = {
      status: 'ready',
      generation: payload.generation,
      sourceFormatId: payload.formatId,
      url: uploaded.url,
      mimeType: 'audio/wav',
      readyAt: new Date().toISOString(),
      outputBytes: prepared.outputBytes,
    };
    derivativeCommitted = await writeDerivativeState(tx, {
      recordingId: payload.recordingId,
      creatorProfileId: payload.creatorProfileId,
      derivative: ready,
      previewUrl: uploaded.url,
    });
    if (!derivativeCommitted) return;

    logger.info('Audio playback derivative completed', {
      jobId: job.id,
      recordingId: payload.recordingId,
      queueDelayMs,
      conversionDurationMs: Date.now() - startedAt,
      inputBytes: source.blob.size,
      outputBytes: prepared.outputBytes,
      formatId: payload.formatId,
    });
  } catch (error) {
    const safeError = safeJobError(error);
    const shouldRetry = job.attempts < job.maxAttempts;
    const derivative: AudioPlaybackDerivative = shouldRetry
      ? {
          status: 'retrying',
          generation: payload.generation,
          sourceFormatId: payload.formatId,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          retryAt: new Date().toISOString(),
        }
      : {
          status: 'failed',
          generation: payload.generation,
          sourceFormatId: payload.formatId,
          reason: safeError.reason,
          failedAt: new Date().toISOString(),
        };
    await writeDerivativeState(tx, {
      recordingId: payload.recordingId,
      creatorProfileId: payload.creatorProfileId,
      derivative,
    });

    logger.warn('Audio playback derivative failed', {
      jobId: job.id,
      recordingId: payload.recordingId,
      queueDelayMs,
      conversionDurationMs: Date.now() - startedAt,
      formatId: payload.formatId,
      failureReason: safeError.reason,
      attempt: job.attempts,
      maxAttempts: job.maxAttempts,
    });
    throw safeError;
  } finally {
    clearTimeout(timeoutId);
    if (token && uploadedUrl && !derivativeCommitted) {
      await del(uploadedUrl, { token }).catch(() => {});
    }
  }
}
