import { afterEach, describe, expect, it, vi } from 'vitest';

import { decideLeadQualification } from '@/lib/leads/qualification-decision';

const namedCreator = {
  displayName: 'Ada',
  links: [{ url: 'https://instagram.com/ada' }],
};

describe('decideLeadQualification', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(['', 'false', 'true'])(
    'ignores retired generic flag %j for every original public identity example',
    flag => {
      vi.stubEnv('FEATURE_LEAD_QUALIFY_GENERIC', flag);
      for (const creator of [
        namedCreator,
        {
          ...namedCreator,
          links: [{ url: 'https://open.spotify.com/album/abc' }],
        },
        {
          ...namedCreator,
          links: [{ url: 'https://open.spotify.com/artist/abc' }],
        },
      ]) {
        expect(decideLeadQualification(creator)).toEqual({
          status: 'qualified',
          disqualificationReason: null,
        });
      }
      expect(
        decideLeadQualification({ ...namedCreator, displayName: '  ' })
      ).toEqual({
        status: 'disqualified',
        disqualificationReason: 'insufficient_identity',
      });
      expect(
        decideLeadQualification({ ...namedCreator, links: [{ url: '  ' }] })
      ).toEqual({
        status: 'disqualified',
        disqualificationReason: 'insufficient_identity',
      });
    }
  );

  it('qualifies a named creator with a public link and no Spotify', () => {
    expect(decideLeadQualification(namedCreator)).toEqual({
      status: 'qualified',
      disqualificationReason: null,
    });
  });

  it('qualifies a named creator with a Spotify link', () => {
    expect(
      decideLeadQualification({
        ...namedCreator,
        links: [{ url: 'https://open.spotify.com/artist/abc' }],
      })
    ).toEqual({
      status: 'qualified',
      disqualificationReason: null,
    });
  });

  it('rejects a blank name or a blank link', () => {
    expect(
      decideLeadQualification({ ...namedCreator, displayName: '  ' })
    ).toEqual({
      status: 'disqualified',
      disqualificationReason: 'insufficient_identity',
    });
    expect(
      decideLeadQualification({
        ...namedCreator,
        links: [{ url: '  ' }],
      })
    ).toEqual({
      status: 'disqualified',
      disqualificationReason: 'insufficient_identity',
    });
    expect(decideLeadQualification({ ...namedCreator, links: [] })).toEqual({
      status: 'disqualified',
      disqualificationReason: 'insufficient_identity',
    });
  });
});
