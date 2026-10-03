import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ db: {} }));

import { lookupCreator, parseCreatorLookupInput } from '@/lib/creator-lookup';

const CHANNEL = {
  channelId: 'UCabcdefghijklmnopqrstuv',
  title: "Ari's Take",
  handle: 'aristake',
  uploadsPlaylistId: 'UUabcdefghijklmnopqrstuv',
  description: 'Music business education',
  country: 'US',
  avatarUrl: 'https://yt3.example/avatar.jpg',
} as const;

describe('creator lookup', () => {
  it.each([
    ['youtube:aristake', { kind: 'handle', value: 'aristake' }],
    [
      'youtube:UCabcdefghijklmnopqrstuv',
      { kind: 'id', value: 'UCabcdefghijklmnopqrstuv' },
    ],
    [
      'https://www.youtube.com/@aristake',
      { kind: 'handle', value: 'aristake' },
    ],
  ] as const)(
    'parses %s without treating it as a Jovie username',
    (input, ref) => {
      expect(parseCreatorLookupInput(input)).toEqual(ref);
    }
  );

  it.each(['aristake', 'instagram:aristake', 'https://example.com/aristake'])(
    'rejects ambiguous or unsupported input %s',
    input => {
      expect(parseCreatorLookupInput(input)).toBeNull();
    }
  );

  it('returns a fresh extraction when no public Jovie profile matches', async () => {
    await expect(
      lookupCreator('youtube:aristake', {
        resolveChannel: vi.fn().mockResolvedValue(CHANNEL),
        findProfiles: vi.fn().mockResolvedValue([]),
      })
    ).resolves.toEqual({
      kind: 'success',
      channel: CHANNEL,
      profile: null,
    });
  });

  it('fails safely when a platform identity maps to multiple profiles', async () => {
    await expect(
      lookupCreator('youtube:aristake', {
        resolveChannel: vi.fn().mockResolvedValue(CHANNEL),
        findProfiles: vi
          .fn()
          .mockResolvedValue([{ username: 'one' }, { username: 'two' }]),
      })
    ).resolves.toEqual({ kind: 'ambiguous' });
  });
});
