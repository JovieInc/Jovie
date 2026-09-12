import { describe, expect, it } from 'vitest';
import {
  canonicalizeReleaseArtistHandle,
  decideOpaqueInternalProfileUsername,
  NEVER_SAY_A_WORD_OPAQUE_PROFILE_FIXTURE as FIXTURE,
  isEncodedUnclaimedArtistHandle,
  isOpaqueInternalProfileHandle,
  opaqueInternalProfileRedirectPath,
  publicProfilePathForHandle,
} from './opaque-internal-profile-handle';

describe('opaque internal profile handles (JOV-6201)', () => {
  it('recognizes the Never Say a Word dogfood ID as an opaque handle', () => {
    expect(isOpaqueInternalProfileHandle(FIXTURE.opaqueHandle)).toBe(true);
    expect(isOpaqueInternalProfileHandle('  TMOC9MM7XFVX02C  ')).toBe(true);
    expect(isOpaqueInternalProfileHandle(FIXTURE.ownerHandle)).toBe(false);
    expect(isOpaqueInternalProfileHandle('tmoc-artist')).toBe(false);
    expect(isOpaqueInternalProfileHandle('tmoc123456789')).toBe(false);
    expect(isOpaqueInternalProfileHandle(null)).toBe(false);
  });

  it('does not treat encoded unclaimed collaborator handles as junk IDs', () => {
    expect(isEncodedUnclaimedArtistHandle('a_eiqd46x3irj64dlgo8a3glau4')).toBe(
      true
    );
    expect(isOpaqueInternalProfileHandle('a_eiqd46x3irj64dlgo8a3glau4')).toBe(
      false
    );
  });

  it('rewrites the release-page artist name to the canonical owner handle', () => {
    expect(
      canonicalizeReleaseArtistHandle({
        handle: FIXTURE.opaqueHandle,
        name: FIXTURE.artistName,
        ownerHandle: FIXTURE.ownerHandle,
        ownerName: FIXTURE.ownerName,
      })
    ).toBe(FIXTURE.ownerHandle);
  });

  it('does not link a featured opaque ID that is not the page owner', () => {
    expect(
      canonicalizeReleaseArtistHandle({
        handle: FIXTURE.opaqueHandle,
        name: 'LYNX',
        ownerHandle: FIXTURE.ownerHandle,
        ownerName: FIXTURE.ownerName,
      })
    ).toBeNull();
  });

  it('keeps a real collaborator handle and remaps an encoded owner handle', () => {
    expect(
      canonicalizeReleaseArtistHandle({
        handle: 'djnova',
        name: 'DJ Nova',
        ownerHandle: FIXTURE.ownerHandle,
        ownerName: FIXTURE.ownerName,
      })
    ).toBe('djnova');

    expect(
      canonicalizeReleaseArtistHandle({
        handle: 'a_eiqd46x3irj64dlgo8a3glau4',
        name: FIXTURE.artistName,
        ownerHandle: FIXTURE.ownerHandle,
        ownerName: FIXTURE.ownerName,
      })
    ).toBe(FIXTURE.ownerHandle);
  });

  it('redirects the opaque profile URL to the canonical handle when one exists', () => {
    const decision = decideOpaqueInternalProfileUsername({
      username: FIXTURE.opaqueHandle,
      canonicalHandle: FIXTURE.ownerHandle,
    });

    expect(decision).toEqual({
      action: 'redirect',
      handle: FIXTURE.ownerHandle,
    });
    expect(
      opaqueInternalProfileRedirectPath(
        decision as Extract<typeof decision, { action: 'redirect' }>
      )
    ).toBe(publicProfilePathForHandle(FIXTURE.ownerHandle));
  });

  it('404s an opaque profile URL with no canonical twin', () => {
    expect(
      decideOpaqueInternalProfileUsername({
        username: FIXTURE.opaqueHandle,
        canonicalHandle: null,
      })
    ).toEqual({ action: 'not_found' });
    expect(
      decideOpaqueInternalProfileUsername({
        username: FIXTURE.opaqueHandle,
        canonicalHandle: FIXTURE.opaqueHandle,
      })
    ).toEqual({ action: 'not_found' });
  });

  it('serves ordinary human handles unchanged', () => {
    expect(
      decideOpaqueInternalProfileUsername({
        username: FIXTURE.ownerHandle,
        canonicalHandle: null,
      })
    ).toEqual({ action: 'serve' });
  });
});
