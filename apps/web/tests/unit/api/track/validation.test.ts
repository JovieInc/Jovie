import { describe, expect, it } from 'vitest';
import { validateTrackRequest } from '@/app/api/track/validation';

describe('validateTrackRequest', () => {
  it('normalizes smartlink context metadata', () => {
    const result = validateTrackRequest({
      handle: 'artist123',
      linkType: 'listen',
      target: 'spotify',
      context: {
        contentType: 'release',
        contentId: ' rel_123 ',
        provider: ' spotify ',
        smartLinkSlug: 'my-release',
      },
    });

    if ('error' in result) {
      throw new Error('Expected validation to succeed');
    }

    expect(result.data.context).toEqual({
      contentType: 'release',
      contentId: 'rel_123',
      provider: 'spotify',
      smartLinkSlug: 'my-release',
    });
  });

  it('drops invalid context fields', () => {
    const result = validateTrackRequest({
      handle: 'artist123',
      linkType: 'listen',
      target: 'spotify',
      context: {
        contentType: 'invalid',
        contentId: '',
        provider: 123,
      },
    });

    if ('error' in result) {
      throw new Error('Expected validation to succeed');
    }

    expect(result.data.context).toBeUndefined();
  });
});
