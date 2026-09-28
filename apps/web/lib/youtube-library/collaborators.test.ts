import { describe, expect, it } from 'vitest';
import { resolveYouTubeCollaboratorClaims } from './collaborators';

const catalog = {
  ownerArtistName: 'Tim',
  collaborators: [],
  releases: [],
};

describe('resolveYouTubeCollaboratorClaims evidence source', () => {
  it('uses the provider list, then the description, then the title', () => {
    expect(
      resolveYouTubeCollaboratorClaims({
        creditedNames: ['Ada Lane'],
        description: 'feat. Ada Lane',
        catalog,
      })[0]?.evidence.source
    ).toBe('provider');

    expect(
      resolveYouTubeCollaboratorClaims({
        description: 'feat. Ada Lane',
        catalog,
      })[0]?.evidence.source
    ).toBe('youtube_description');

    expect(
      resolveYouTubeCollaboratorClaims({
        title: 'Song feat. Ada Lane',
        description: '',
        catalog,
      })[0]?.evidence.source
    ).toBe('youtube_title');
  });
});
