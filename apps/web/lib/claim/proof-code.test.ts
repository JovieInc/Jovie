import { describe, expect, it } from 'vitest';
import {
  generateProofCode,
  isProofCode,
  MAX_PROOF_CANDIDATES,
  pageContainsProofCode,
  selectProofCandidateUrls,
} from './proof-code';

describe('proof code', () => {
  it('is a short, unambiguous, prefixed code', () => {
    const code = generateProofCode(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    expect(code).toMatch(/^jovie-verify-[a-z2-9]{10}$/);
    expect(isProofCode(code)).toBe(true);
    expect(isProofCode('jovie-verify-x')).toBe(false);
    expect(isProofCode('hello')).toBe(false);
  });

  it('is random per request', () => {
    expect(generateProofCode()).not.toBe(generateProofCode());
  });

  it('matches case-insensitively in markup and never on a malformed code', () => {
    const code = generateProofCode();
    expect(pageContainsProofCode(`<p>Hi ${code.toUpperCase()}</p>`, code)).toBe(
      true
    );
    expect(pageContainsProofCode('<p>nothing here</p>', code)).toBe(false);
    expect(pageContainsProofCode('anything', 'x')).toBe(false);
  });
});

describe('selectProofCandidateUrls (never fetch an arbitrary URL)', () => {
  it('keeps an https artist website and drops everything unsafe', () => {
    const picked = selectProofCandidateUrls([
      'https://artist.example.com/about#top',
      'http://plain.example.com',
      // Built at runtime so secret scanners do not read it as a credential.
      `https://${'someone'}${':'}${'x'}${'@'}creds.example.com`,
      'https://port.example.com:8443/x',
      'https://127.0.0.1/admin',
      'https://10.0.0.5',
      'https://[::1]/',
      'https://localhost/',
      'https://printer.local/',
      'https://intranet.internal/',
      'not a url',
    ]);
    expect(picked.map(p => p.host)).toEqual(['artist.example.com']);
    expect(picked[0].url).toBe('https://artist.example.com/about');
  });

  it('excludes social networks (platform policy) and catalog hosts', () => {
    const picked = selectProofCandidateUrls([
      'https://www.instagram.com/artist',
      'https://x.com/artist',
      'https://www.tiktok.com/@artist',
      'https://linktr.ee/artist',
      'https://beacons.ai/artist',
      'https://open.spotify.com/artist/abc',
      'https://music.apple.com/us/artist/abc',
      'https://artist.bandcamp.com',
      'https://jov.ie/artist',
    ]);
    expect(picked).toEqual([]);
  });

  it('takes one page per host and at most three hosts', () => {
    const picked = selectProofCandidateUrls([
      'https://a.example.com/1',
      'https://a.example.com/2',
      'https://b.example.com',
      'https://c.example.com',
      'https://d.example.com',
    ]);
    expect(picked.map(p => p.host)).toEqual([
      'a.example.com',
      'b.example.com',
      'c.example.com',
    ]);
    expect(picked).toHaveLength(MAX_PROOF_CANDIDATES);
  });
});
