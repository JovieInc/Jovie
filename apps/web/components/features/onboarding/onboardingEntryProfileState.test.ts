import { describe, expect, it } from 'vitest';
import { buildEntryProfileBuilderState } from './onboardingEntryProfileState';

const MEGARAN_ENTRY = {
  status: 'claimable',
  handle: 'megaran',
  displayName: 'Mega Ran',
  avatarUrl: 'https://blob.example.com/a.png',
  spotifyId: null,
  spotifyUrl: null,
  genres: ['hip hop'],
  socialLinks: ['https://instagram.com/megaran'],
  linkPlatforms: ['instagram'],
  linkCount: 1,
} as const;

describe('buildEntryProfileBuilderState (JOV-7753)', () => {
  it('maps a prebuilt page to rail preview state and nothing else', () => {
    expect(buildEntryProfileBuilderState(MEGARAN_ENTRY)).toEqual({
      artist: {
        id: 'handle-megaran',
        name: 'Mega Ran',
        url: '',
        imageUrl: 'https://blob.example.com/a.png',
        genres: ['hip hop'],
      },
      artistConfirmed: false,
      handle: 'megaran',
      socialLinks: ['https://instagram.com/megaran'],
    });
    expect(
      buildEntryProfileBuilderState({ status: 'available', handle: 'x-y-z' })
        .artist
    ).toBeNull();
    expect(buildEntryProfileBuilderState(null).artist).toBeNull();
  });

  it('seeds the draft panel with an open handle before the first message (Pen R6As7U)', () => {
    expect(
      buildEntryProfileBuilderState({ status: 'available', handle: 'timwhite' })
    ).toEqual({
      artist: null,
      artistConfirmed: false,
      handle: 'timwhite',
      socialLinks: [],
    });
  });
});
