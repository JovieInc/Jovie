import { describe, expect, it, vi } from 'vitest';
import type { DbOrTransaction } from '@/lib/db';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import {
  getBoundAppleMusicArtistId,
  parseAppleMusicArtistId,
} from './apple-music-target';

const profileId = '00000000-0000-4000-8000-000000000001';
const tim = '859547284';
const other = '123456789';
const timUrl = `https://music.apple.com/us/artist/tim-white/${tim}?app=music`;

function database(
  profile:
    | { appleMusicId: string | null; appleMusicUrl: string | null }
    | undefined,
  match?: { externalArtistId: string | null; status: string }
) {
  const rows = [profile ? [profile] : [], match ? [match] : []];
  const select = vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: vi.fn().mockResolvedValue(rows.shift()) })),
    })),
  }));
  return { select } as unknown as DbOrTransaction;
}

describe('parseAppleMusicArtistId', () => {
  it.each([
    [timUrl, tim],
    [`https://music.apple.com/gb/artist/${tim}`, tim],
    [`https://itunes.apple.com/us/artist/tim-white/id${tim}`, tim],
    [`https://music.apple.com/us/album/all-this-noise-ep/1031580711`, null],
    [`https://evil.example/music.apple.com/us/artist/x/${tim}`, null],
    ['not a url', null],
    [null, null],
  ] as const)('%s → %s', (url, expected) => {
    expect(parseAppleMusicArtistId(url)).toBe(expected);
  });
});

describe('Apple Music import binding', () => {
  it.each([
    [{ appleMusicId: tim, appleMusicUrl: null }, undefined, tim],
    [{ appleMusicId: null, appleMusicUrl: timUrl }, undefined, tim],
    [{ appleMusicId: tim, appleMusicUrl: timUrl }, undefined, tim],
    [
      { appleMusicId: null, appleMusicUrl: null },
      { status: 'confirmed', externalArtistId: tim },
      tim,
    ],
    [
      { appleMusicId: null, appleMusicUrl: null },
      { status: 'suggested', externalArtistId: tim },
      null,
    ],
    [
      { appleMusicId: null, appleMusicUrl: null },
      { status: 'auto_confirmed', externalArtistId: tim },
      null,
    ],
    [
      { appleMusicId: tim, appleMusicUrl: null },
      { status: 'rejected', externalArtistId: tim },
      null,
    ],
    [
      { appleMusicId: tim, appleMusicUrl: null },
      { status: 'confirmed', externalArtistId: other },
      null,
    ],
    [
      {
        appleMusicId: tim,
        appleMusicUrl: `https://music.apple.com/us/artist/x/${other}`,
      },
      undefined,
      null,
    ],
    [{ appleMusicId: 'abc', appleMusicUrl: null }, undefined, null],
  ] as const)('%j %j → %s', async (profile, match, expected) => {
    expect(
      await getBoundAppleMusicArtistId(database(profile, match), profileId)
    ).toBe(expected);
  });

  it('returns null for a missing profile', async () => {
    expect(
      await getBoundAppleMusicArtistId(database(undefined), profileId)
    ).toBeNull();
  });
});
