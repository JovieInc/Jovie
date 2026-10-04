import { describe, expect, it } from 'vitest';

import { decideLeadQualification } from '@/lib/leads/qualification-decision';

const namedCreator = {
  displayName: 'Ada',
  links: [{ url: 'https://instagram.com/ada' }],
};

describe('decideLeadQualification', () => {
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
