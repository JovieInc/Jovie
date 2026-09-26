import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_IDENTITY_HANDLES,
  type PlaceholderProfileRow,
  planPlaceholderUnpublish,
} from './unpublish-placeholder-identities';

function row(overrides: Partial<PlaceholderProfileRow>): PlaceholderProfileRow {
  return {
    id: 'id',
    username: 'user',
    usernameNormalized: 'user',
    displayName: 'user',
    isPublic: true,
    isClaimed: true,
    ...overrides,
  };
}

describe('unpublish-placeholder-identities', () => {
  it('covers the confirmed JOV-6464 leftover handles', () => {
    expect(PLACEHOLDER_IDENTITY_HANDLES).toEqual([
      'hello',
      'ti89m',
      'tim1',
      'timwhite1',
    ]);
  });

  it('unpublishes only claimed public rows in the allowlist', () => {
    const target = row({
      id: 'a',
      username: 'timwhite1',
      usernameNormalized: 'timwhite1',
      displayName: 'timwhite',
    });
    const alreadyPrivate = row({
      id: 'b',
      username: 'hello',
      usernameNormalized: 'hello',
      isPublic: false,
    });
    const unclaimed = row({
      id: 'c',
      username: 'ti89m',
      usernameNormalized: 'ti89m',
      isClaimed: false,
    });
    const notTargeted = row({
      id: 'd',
      username: 'realartist',
      usernameNormalized: 'realartist',
    });

    const plan = planPlaceholderUnpublish(
      [target, alreadyPrivate, unclaimed, notTargeted],
      [...PLACEHOLDER_IDENTITY_HANDLES]
    );

    expect(plan.unpublish.map(r => r.id)).toEqual(['a']);
    expect(plan.alreadyPrivate.map(r => r.id)).toEqual(['b']);
    expect(plan.unclaimed.map(r => r.id)).toEqual(['c']);
    expect(plan.missingHandles).toEqual(['tim1']);
  });

  it('treats null isPublic/isClaimed as not eligible', () => {
    const legacy = row({ id: 'a', isPublic: null, isClaimed: null });
    const plan = planPlaceholderUnpublish([legacy], ['user']);
    expect(plan.unpublish).toHaveLength(0);
    expect(plan.unclaimed.map(r => r.id)).toEqual(['a']);
  });
});
