import { describe, expect, it } from 'vitest';
import { buildPublicWorkLinkLines } from './public-work-links';

describe('buildPublicWorkLinkLines', () => {
  it('retains websites, portfolios, code, and podcast destinations', () => {
    expect(
      buildPublicWorkLinkLines([
        { platform: 'website', url: 'https://example.com/' },
        { platform: 'portfolio', url: 'https://example.com/work' },
        { platform: 'github', url: 'https://github.com/example' },
        { platform: 'podcast', url: 'https://example.com/podcast' },
      ])
    ).toEqual([
      '- [website](<https://example.com/>)',
      '- [portfolio](<https://example.com/work>)',
      '- [github](<https://github.com/example>)',
      '- [podcast](<https://example.com/podcast>)',
    ]);
  });

  it('uses the host for missing or empty platform labels', () => {
    expect(
      buildPublicWorkLinkLines([
        { url: 'https://example.com/work' },
        { platform: '', url: 'https://example.org/work' },
        { platform: null, url: 'http://example.net/' },
      ])
    ).toEqual([
      '- [example.com](<https://example.com/work>)',
      '- [example.org](<https://example.org/work>)',
      '- [example.net](<http://example.net/>)',
    ]);
  });

  it('deduplicates normalized URLs while preserving distinct work pages', () => {
    expect(
      buildPublicWorkLinkLines([
        { platform: 'website', url: ' https://EXAMPLE.com:443 ' },
        { platform: 'custom', url: 'https://example.com/' },
        { platform: 'portfolio', url: 'https://example.com/work' },
      ])
    ).toEqual([
      '- [website](<https://example.com/>)',
      '- [portfolio](<https://example.com/work>)',
    ]);
  });

  it('does not repeat destinations already listed in other guide sections', () => {
    expect(
      buildPublicWorkLinkLines(
        [
          { platform: 'custom', url: 'https://example.com/' },
          { platform: 'portfolio', url: 'https://example.org/work' },
        ],
        [null, undefined, 'invalid', 'https://EXAMPLE.com:443']
      )
    ).toEqual(['- [portfolio](<https://example.org/work>)']);
  });

  it('omits invalid, credential-bearing, and non-web URLs', () => {
    const passwordUrl = new URL('https://example.com/');
    passwordUrl.password = 'synthetic-fixture';
    const urls = [
      '',
      'not a url',
      '/private',
      'javascript:alert(1)',
      'data:text/html,hello',
      'file:///etc/passwd',
      'mailto:private@example.com',
      passwordUrl.toString(),
      'https://user@example.com/',
    ];
    expect(buildPublicWorkLinkLines(urls.map(url => ({ url })))).toEqual([]);
  });

  it('rejects control characters rather than allowing URL parser normalization', () => {
    expect(
      buildPublicWorkLinkLines([
        { url: 'https://example.com/\n## forged section' },
        { url: 'https://exa\tmple.com/' },
        { url: 'https://example.com/\u007f' },
      ])
    ).toEqual([]);
  });

  it('does not interpolate Markdown or multiline instructions from labels', () => {
    expect(
      buildPublicWorkLinkLines([
        {
          platform: 'portfolio](https://wrong.example)\n## forged section',
          url: 'https://example.com/work',
        },
      ])
    ).toEqual(['- [example.com](<https://example.com/work>)']);
  });

  it('keeps parentheses inside a valid Markdown destination', () => {
    expect(
      buildPublicWorkLinkLines([
        { platform: 'my_work', url: 'https://example.com/work_(live)' },
      ])
    ).toEqual(['- [my work](<https://example.com/work_(live)>)']);
  });

  it('escapes a bracketed host label', () => {
    expect(
      buildPublicWorkLinkLines([{ url: 'https://[2001:db8::1]/work' }])
    ).toEqual(['- [\\[2001:db8::1\\]](<https://[2001:db8::1]/work>)']);
  });

  it('returns no lines for an empty public link collection', () => {
    expect(buildPublicWorkLinkLines([])).toEqual([]);
  });
});
