import 'server-only';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import type { ReelTemplateInputs } from '@/lib/db/schema/reel-jobs';

export type RenderResult = {
  buffer: Buffer;
  durationMs: number;
};

let cachedBundleUrl: string | null = null;

async function getBundle(): Promise<string> {
  if (cachedBundleUrl) return cachedBundleUrl;
  const entry = path.join(
    process.cwd(),
    'lib',
    'reels',
    'compositions',
    'entry.ts'
  );
  cachedBundleUrl = await bundle({
    entryPoint: entry,
    webpackOverride: config => config,
  });
  return cachedBundleUrl;
}

/**
 * Render a reel composition to an in-memory MP4 buffer.
 * Caller is responsible for uploading to Blob and updating the reel_jobs row.
 *
 * Runs synchronously within a Vercel serverless function (maxDuration 300s
 * is plenty for 7-second compositions — expect ~30-60s render time).
 */
export async function renderReel(
  templateSlug: string,
  inputs: ReelTemplateInputs
): Promise<RenderResult> {
  const started = Date.now();
  const serveUrl = await getBundle();

  const composition = await selectComposition({
    serveUrl,
    id: templateSlug,
    inputProps: inputs,
  });

  const outputPath = path.join(os.tmpdir(), `jovie-reel-${randomUUID()}.mp4`);

  try {
    await renderMedia({
      serveUrl,
      composition,
      codec: 'h264',
      inputProps: inputs,
      outputLocation: outputPath,
      imageFormat: 'jpeg',
      overwrite: true,
      concurrency: 1,
      chromiumOptions: {
        gl: 'angle-egl',
        enableMultiProcessOnLinux: false,
      },
    });

    const buffer = await fs.readFile(outputPath);
    return {
      buffer,
      durationMs: Date.now() - started,
    };
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
}
