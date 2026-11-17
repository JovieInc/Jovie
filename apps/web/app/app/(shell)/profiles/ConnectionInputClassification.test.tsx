import { describe, expect, it } from 'vitest';
import { classifyConnectionInput } from './AddConnectionRail';

describe('classifyConnectionInput', () => {
  it('normalizes and classifies a bare provider domain', () => {
    const result = classifyConnectionInput('Instagram.com/timwhite', [], 'Tim');

    expect(result.error).toBeNull();
    expect(result.candidate).toMatchObject({
      platformId: 'instagram',
      platformName: 'Instagram',
      url: 'https://instagram.com/timwhite',
    });
  });

  it('offers ranked handle-capable platforms for an at-handle', () => {
    const result = classifyConnectionInput('@timwhite', [], 'Tim');

    expect(result.candidate).toBeNull();
    expect(result.suggestions.slice(0, 4).map(item => item.platformId)).toEqual(
      ['instagram', 'tiktok', 'youtube', 'twitter']
    );
    expect(result.suggestions[0]).toMatchObject({
      handle: '@timwhite',
      url: 'https://instagram.com/timwhite',
    });
  });

  it('fuzzy filters a platform-qualified username', () => {
    const result = classifyConnectionInput('insta timwhite', [], 'Tim');

    expect(result.suggestions[0]).toMatchObject({
      platformId: 'instagram',
      handle: '@timwhite',
    });
  });

  it('does not suggest a platform that already exists', () => {
    const result = classifyConnectionInput('@timwhite', ['instagram'], 'Tim');

    expect(result.suggestions.map(item => item.platformId)).not.toContain(
      'instagram'
    );
  });

  it('rejects credential-bearing URLs', () => {
    const credentialBearingUrl = [
      'https://user',
      'pass@instagram.com/timwhite',
    ].join(':');
    const result = classifyConnectionInput(credentialBearingUrl, [], 'Tim');

    expect(result.candidate).toBeNull();
    expect(result.error).toMatch(/without credentials/i);
  });
});
