import { describe, expect, it } from 'vitest';
import { resolutionIsSuccess } from './truth';

const link = {
  provider: 'spotify',
  url: 'https://open.spotify.com/track/1',
  provenance: 'test',
  confidence: 1,
};

describe('resolutionIsSuccess', () => {
  it('accepts only a resolved result that saved at least one link', () => {
    expect(resolutionIsSuccess({ status: 'resolved', links: [link] })).toBe(
      true
    );
    expect(resolutionIsSuccess({ status: 'resolved', links: [] })).toBe(false);
    expect(resolutionIsSuccess({ status: 'ambiguous', links: [] })).toBe(false);
    expect(resolutionIsSuccess({ status: 'no_match', links: [] })).toBe(false);
    expect(resolutionIsSuccess({ status: 'upstream_error', links: [] })).toBe(
      false
    );
    expect(resolutionIsSuccess({ status: 'ambiguous', links: [link] })).toBe(
      false
    );
  });
});
