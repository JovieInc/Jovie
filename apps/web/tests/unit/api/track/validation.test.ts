import { beforeEach, describe, expect, it, vi } from 'vitest';
import { validateTrackRequest } from '@/app/api/track/validation';

describe('validateTrackRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('accepts tour_date as a valid contentType', () => {
    const result = validateTrackRequest({
      handle: 'artist123',
      linkType: 'other',
      target: 'https://ticketmaster.com/event/abc',
      context: {
        contentType: 'tour_date',
        contentId: '550e8400-e29b-41d4-a716-446655440000',
      },
    });

    if ('error' in result) {
      throw new Error('Expected validation to succeed');
    }

    expect(result.data.context).toEqual({
      contentType: 'tour_date',
      contentId: '550e8400-e29b-41d4-a716-446655440000',
    });
  });
});
