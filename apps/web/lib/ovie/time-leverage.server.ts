import 'server-only';

import { get, put } from '@vercel/blob';
import {
  getBlobCommandOptions,
  isBlobStorageConfigured,
} from '@/lib/blob-config';
import {
  isTimeLeverageFresh,
  TIME_LEVERAGE_PATH,
  type TimeLeverage,
  timeLeverageSchema,
} from './time-leverage';

export async function loadTimeLeverage(): Promise<TimeLeverage | null> {
  if (!isBlobStorageConfigured()) return null;
  const blob = await get(TIME_LEVERAGE_PATH, {
    ...getBlobCommandOptions(),
    access: 'public',
    abortSignal: AbortSignal.timeout(5_000),
  });
  if (!blob || blob.statusCode !== 200) return null;
  const parsed = timeLeverageSchema.safeParse(
    await new Response(blob.stream).json()
  );
  return parsed.success &&
    isTimeLeverageFresh(parsed.data.observedAt, Date.now())
    ? parsed.data
    : null;
}

export async function writeTimeLeverage(data: TimeLeverage): Promise<void> {
  if (!isBlobStorageConfigured()) throw new Error('Blob storage unavailable');
  await put(TIME_LEVERAGE_PATH, JSON.stringify(data), {
    ...getBlobCommandOptions(),
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    abortSignal: AbortSignal.timeout(5_000),
  });
}
