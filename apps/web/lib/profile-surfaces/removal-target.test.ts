import { describe, expect, it } from 'vitest';
import { resolvePresenceRemovalTarget } from './removal-target';

const surface = {
  id: 'surface',
  kind: 'social',
  url: 'https://soundcloud.com/artist',
};
const source = {
  surfaceId: 'surface',
  sourceType: 'social_link',
  sourceRefId: 'link',
};
const link = {
  id: 'link',
  creatorProfileId: 'profile',
  url: surface.url,
  version: 3,
  isActive: true,
  state: 'active',
};

describe('Presence removal provenance', () => {
  it('resolves only the explicit active link and retains other evidence', () => {
    expect(
      resolvePresenceRemovalTarget(
        surface,
        'profile',
        [
          source,
          { ...source, sourceType: 'identity_link', sourceRefId: 'other' },
        ],
        [link]
      )
    ).toEqual({ linkId: 'link', url: surface.url, version: 3 });
  });
  it.each(['jovie', 'preview'])('excludes %s targets', kind => {
    expect(
      resolvePresenceRemovalTarget(
        {
          ...surface,
          kind,
          id: kind === 'preview' ? 'preview:one' : surface.id,
        },
        'profile',
        [source],
        [link]
      )
    ).toBeUndefined();
  });
  it.each(
    [
      [],
      [{ ...source, sourceType: 'identity_link' }],
      [{ ...source, sourceType: 'dsp_match' }],
      [source, { ...source, sourceRefId: 'second-link' }],
      [{ ...source, surfaceId: 'other' }],
    ].map(sources => ({ sources }))
  )(
    'fails closed for missing or ambiguous social provenance %j',
    ({ sources }) => {
      expect(
        resolvePresenceRemovalTarget(surface, 'profile', sources, [link])
      ).toBeUndefined();
    }
  );
  it.each([
    { creatorProfileId: 'other' },
    { isActive: false },
    { state: 'rejected' },
    { url: 'https://soundcloud.com/replaced' },
    { version: 0 },
    { version: 1.5 },
    { id: 'different' },
  ])('rejects stale, foreign or invalid links %j', patch => {
    expect(
      resolvePresenceRemovalTarget(
        surface,
        'profile',
        [source],
        [{ ...link, ...patch }]
      )
    ).toBeUndefined();
  });
});
