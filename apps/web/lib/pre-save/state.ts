import crypto from 'node:crypto';
import { env } from '@/lib/env-server';

interface SpotifyPreSaveState {
  releaseId: string;
  trackId: string | null;
  username: string;
  slug: string;
  ts: number;
}

function getStateSecret(): string {
  return env.TRACKING_TOKEN_SECRET || env.CRON_SECRET || 'dev-pre-save-secret';
}

export function encodeSpotifyPreSaveState(
  payload: Omit<SpotifyPreSaveState, 'ts'>
): string {
  const state: SpotifyPreSaveState = { ...payload, ts: Date.now() };
  const data = Buffer.from(JSON.stringify(state)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getStateSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export function decodeSpotifyPreSaveState(state: string): SpotifyPreSaveState {
  const [data, sig] = state.split('.');
  if (!data || !sig) throw new Error('Invalid Spotify pre-save state format');

  const expected = crypto
    .createHmac('sha256', getStateSecret())
    .update(data)
    .digest('base64url');

  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('Invalid Spotify pre-save state signature');
  }

  const parsed = JSON.parse(
    Buffer.from(data, 'base64url').toString('utf8')
  ) as SpotifyPreSaveState;

  if (Date.now() - parsed.ts > 15 * 60 * 1000) {
    throw new Error('Spotify pre-save state expired');
  }

  return parsed;
}
