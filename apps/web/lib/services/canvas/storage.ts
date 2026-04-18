import 'server-only';

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { get, put } from '@vercel/blob';
import { env } from '@/lib/env-server';

const LOCAL_STORAGE_ROOT = join(process.cwd(), '.context', 'canvas-storage');

function isLocalStoragePath(pathname: string): boolean {
  return pathname.startsWith('local://');
}

function toLocalFilePath(storagePath: string): string {
  return join(LOCAL_STORAGE_ROOT, storagePath.replace(/^local:\/\//, ''));
}

export async function storeCanvasArtifact(params: {
  readonly storagePath: string;
  readonly buffer: Buffer;
  readonly contentType: string;
}): Promise<string> {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    const filePath = toLocalFilePath(`local://${params.storagePath}`);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, params.buffer);
    return `local://${params.storagePath}`;
  }

  const blob = await put(params.storagePath, params.buffer, {
    access: 'private',
    token: env.BLOB_READ_WRITE_TOKEN,
    contentType: params.contentType,
    addRandomSuffix: false,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  return blob.pathname;
}

export async function readCanvasArtifact(params: {
  readonly storagePath: string;
}): Promise<{
  readonly body: Buffer;
  readonly contentType: string | null;
  readonly contentLength: number | null;
}> {
  if (isLocalStoragePath(params.storagePath)) {
    const filePath = toLocalFilePath(params.storagePath);
    const body = await readFile(filePath);
    return {
      body,
      contentType: null,
      contentLength: body.length,
    };
  }

  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new Error('Blob storage not configured');
  }

  const result = await get(params.storagePath, {
    access: 'private',
    token: env.BLOB_READ_WRITE_TOKEN,
  });
  if (!result || result.statusCode !== 200) {
    throw new Error('Canvas artifact not found');
  }
  const body = Buffer.from(await new Response(result.stream).arrayBuffer());

  return {
    body,
    contentType: result.blob.contentType ?? null,
    contentLength: result.blob.size ?? body.length,
  };
}
