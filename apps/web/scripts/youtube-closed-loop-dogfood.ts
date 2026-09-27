#!/usr/bin/env tsx
/**
 * JOV-5883 — automated dogfood of the YouTube closed loop on Tim's channel.
 * Run from repo root:
 *
 *   pnpm --filter @jovie/web dogfood:youtube --channel <@handle|url|UCid> --output <dir>
 *
 * Reads the golden path through the deployed paste-preview surface
 * (`--base-url`, default https://jov.ie). Optional env:
 *   YOUTUBE_ACCESS_TOKEN  — Connect-granted token for Tim's channel; enables
 *                           the videos.update link-apply stage (verified via
 *                           the official oauth2 tokeninfo scope readback).
 *   YOUTUBE_DATA_API_KEY  — public Data API key; enriches the receipt with
 *                           upload dates for ICP qualification.
 * Official API only; thumbnails.set is never called; send stays human.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  runYoutubeClosedLoopDogfood,
  YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA,
  type YoutubeClosedLoopDogfoodDeps,
  type YoutubeDogfoodPastePreview,
} from '@/lib/acquisition/youtube-closed-loop-dogfood';
import { createYouTubeSnippetWriter } from '@/lib/connectors/youtube/provider';
import { TIM_WHITE_PROFILE } from '@/lib/tim-white';
import {
  listRecentPublicVideos,
  parseYouTubeChannelInput,
  resolveYouTubeChannel,
} from '@/lib/youtube/resolve-channel';
import { buildExpectedJovieUrl } from '@/lib/youtube-library/link-inspect';

const DEFAULT_BASE_URL = 'https://jov.ie';
const TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo';

function argValue(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function previewFromHttp(baseUrl: string) {
  return async (channelInput: string): Promise<YoutubeDogfoodPastePreview> => {
    const response = await fetch(`${baseUrl}/api/youtube-thumbnails/preview`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ channel: channelInput }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      error?: string;
      channel?: { id: string; title: string; handle: string | null };
      mode?: 'preview_only' | 'before_after';
      items?: readonly {
        videoId: string;
        title: string;
        beforeUrl: string;
        afterUrl: string | null;
      }[];
    };
    if (!response.ok || payload.ok !== true || !payload.channel) {
      throw new Error(
        `preview route returned ${response.status}: ${payload.error ?? 'unknown'}`
      );
    }
    return {
      channel: payload.channel,
      mode: payload.mode ?? 'preview_only',
      items: payload.items ?? [],
    };
  };
}

/** Enrich preview items with publish dates so ICP qualification runs. */
async function enrichPublishedAt(
  preview: YoutubeDogfoodPastePreview,
  channelInput: string
): Promise<YoutubeDogfoodPastePreview> {
  if (!process.env.YOUTUBE_DATA_API_KEY?.trim()) return preview;
  const ref = parseYouTubeChannelInput(channelInput);
  const channel = ref ? await resolveYouTubeChannel(ref) : null;
  if (!channel) return preview;
  const recent = await listRecentPublicVideos(channel.uploadsPlaylistId, 50);
  const dates = new Map(
    recent.map(video => [video.videoId, video.publishedAt])
  );
  return {
    ...preview,
    items: preview.items.map(item => ({
      ...item,
      publishedAt: dates.get(item.videoId) ?? null,
    })),
  };
}

/** Verify the Connect grant's scopes via the official tokeninfo readback. */
async function grantedScopes(accessToken: string): Promise<readonly string[]> {
  const url = new URL(TOKENINFO_URL);
  url.searchParams.set('access_token', accessToken);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return [];
  const payload = (await response.json()) as { scope?: string };
  return (payload.scope ?? '').split(' ').filter(Boolean);
}

export async function dogfoodYoutubeClosedLoop(args: string[]) {
  const channelInput = argValue(args, '--channel');
  const output = resolve(argValue(args, '--output'));
  const baseUrl = (
    args.includes('--base-url')
      ? argValue(args, '--base-url')
      : DEFAULT_BASE_URL
  )!.replace(/\/+$/, '');
  const jovieOrigin = (
    args.includes('--jovie-origin')
      ? argValue(args, '--jovie-origin')
      : DEFAULT_BASE_URL
  )!.replace(/\/+$/, '');
  const jovieHandle = args.includes('--jovie-handle')
    ? argValue(args, '--jovie-handle')
    : TIM_WHITE_PROFILE.publicProfileHandle;
  const expectedUrl = buildExpectedJovieUrl({
    origin: jovieOrigin,
    handle: jovieHandle!,
  });
  if (!expectedUrl) throw new Error('could not build the expected Jovie URL');

  const pasteOnly = previewFromHttp(baseUrl);
  const deps: YoutubeClosedLoopDogfoodDeps = {
    pasteChannelPreview: channel =>
      pasteOnly(channel).then(preview => enrichPublishedAt(preview, channel)),
  };

  const accessToken = process.env.YOUTUBE_ACCESS_TOKEN?.trim();
  if (accessToken) {
    const scopes = await grantedScopes(accessToken);
    deps.auth = { state: 'ok', scopes };
    deps.writer = createYouTubeSnippetWriter({ accessToken });
  } else {
    deps.auth = { state: 'missing' };
  }

  const receipt = await runYoutubeClosedLoopDogfood({
    channelInput,
    expectedUrl,
    deps,
    correlationId: `jov-5883:tim-channel:${new Date().toISOString()}`,
  });

  await mkdir(output, { recursive: true });
  const file = join(
    output,
    `youtube-closed-loop-dogfood-${receipt.observedAt.replaceAll(/[:.]/g, '-')}.json`
  );
  await writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);

  console.log(`schema: ${YOUTUBE_CLOSED_LOOP_DOGFOOD_SCHEMA}`);
  for (const stage of receipt.stages) {
    console.log(`[${stage.status}] ${stage.stage}: ${stage.summary}`);
  }
  console.log(`outcome: ${receipt.outcome}`);
  console.log(`receipt: ${file}`);
  return receipt.outcome === 'fail' ? 1 : 0;
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]).endsWith('youtube-closed-loop-dogfood.ts');

if (isMain) {
  dogfoodYoutubeClosedLoop(process.argv.slice(2))
    .then(code => {
      process.exitCode = code;
    })
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    });
}
