import 'server-only';

import { get, put } from '@vercel/blob';
import {
  getBlobCommandOptions,
  isBlobStorageConfigured,
} from '@/lib/blob-config';
import { logger } from '@/lib/utils/logger';
import {
  mergePipelineBottleneck,
  PIPELINE_BOTTLENECK_PATH,
  PIPELINE_CONTRIBUTION_PATH,
  type PipelineBottleneckContribution,
} from './pipeline-bottleneck';

async function readBlob(path: string): Promise<unknown> {
  const blob = await get(path, {
    ...getBlobCommandOptions(),
    access: 'public',
    // Public overwrites propagate through Blob's CDN within 60s. The SDK's
    // useCache:false origin bypass applies only to private storage.
    // https://vercel.com/docs/vercel-blob#caching
    abortSignal: AbortSignal.timeout(5_000),
  });
  if (!blob || blob.statusCode !== 200) return null;
  return new Response(blob.stream).json();
}

export async function loadPipelineBottleneck() {
  if (!isBlobStorageConfigured()) return null;
  const [summer, contribution] = await Promise.all([
    readBlob(PIPELINE_BOTTLENECK_PATH),
    readBlob(PIPELINE_CONTRIBUTION_PATH).catch(() => {
      logger.warn('[pipeline-bottleneck] Loop contribution unavailable');
      return null;
    }),
  ]);
  return mergePipelineBottleneck(summer, contribution, Date.now());
}

export async function writePipelineBottleneckContribution(
  data: PipelineBottleneckContribution
): Promise<void> {
  if (!isBlobStorageConfigured()) throw new Error('Blob storage unavailable');
  await put(PIPELINE_CONTRIBUTION_PATH, JSON.stringify(data), {
    ...getBlobCommandOptions(),
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
    abortSignal: AbortSignal.timeout(5_000),
  });
}
