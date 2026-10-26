import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  encodeProfileVariantKey,
  PROFILE_VARIANT_MARKER,
  parseProfileVariantKey,
  signalsFromVariantSeed,
} from './variant';
import { classifyVisitorSource } from './visitor-signals';

const require = createRequire(import.meta.url);
const rewrites = require('../../routing/profile-variant-rewrites.js') as {
  PROFILE_VARIANT_MARKER: string;
  VARIANT_COUNTRIES: readonly string[];
  buildProfileVariantRewrites: () => Array<{
    source: string;
    has: Array<{ type: string; key: string; value?: string }>;
    missing?: Array<{ type: string; key: string; value?: string }>;
    destination: string;
  }>;
};

interface Req {
  readonly headers?: Record<string, string>;
  readonly cookies?: Record<string, string>;
  readonly query?: Record<string, string>;
}

/** Minimal model of Next's has/missing matching and named-capture rewrite. */
function edgeKey(req: Req): string | null {
  for (const rule of rewrites.buildProfileVariantRewrites()) {
    const captures: Record<string, string> = {};
    const read = (c: { type: string; key: string }) =>
      c.type === 'header'
        ? req.headers?.[c.key]
        : c.type === 'cookie'
          ? req.cookies?.[c.key]
          : req.query?.[c.key];
    let ok = true;
    for (const c of rule.has) {
      const v = read(c);
      if (v === undefined) ok = false;
      else if (c.value !== undefined) {
        const m = new RegExp(`^(?:${c.value})$`, 'u').exec(v);
        if (!m) ok = false;
        else Object.assign(captures, m.groups);
      }
    }
    for (const c of rule.missing ?? []) {
      if (read(c) !== undefined) ok = false;
    }
    if (!ok) continue;
    const segment = rule.destination.split('/')[3] ?? '';
    return segment.replace(':cc', captures.cc ?? '');
  }
  return null;
}

describe('variant key codec', () => {
  it('round-trips every combination', () => {
    for (const dsp of [true, false])
      for (const returning of [true, false])
        for (const country of [null, 'US', 'DE']) {
          const seed = { dsp, returning, country };
          expect(parseProfileVariantKey(encodeProfileVariantKey(seed))).toEqual(
            seed
          );
        }
  });

  it('rejects malformed keys', () => {
    for (const bad of [
      '',
      'xx',
      'dn-',
      'dn-usa',
      'dn-us',
      'zz-US',
      'dn-US/../x',
    ])
      expect(parseProfileVariantKey(bad)).toBeNull();
  });

  it('maps a seed to engine signals without inventing device or in-app', () => {
    expect(
      signalsFromVariantSeed(
        { dsp: true, returning: false, country: 'DE' },
        new Date(0)
      )
    ).toMatchObject({
      source: { channel: 'dsp' },
      country: 'DE',
      returning: null,
      device: 'unknown',
      inApp: null,
    });
    expect(signalsFromVariantSeed(null, new Date(0)).source.channel).toBe(
      'direct'
    );
  });
});

describe('edge rewrites agree with the engine signals', () => {
  it('uses the same private marker as the route', () => {
    expect(rewrites.PROFILE_VARIANT_MARKER).toBe(PROFILE_VARIANT_MARKER);
  });

  it('keeps the canonical page when no signal applies', () => {
    expect(edgeKey({})).toBeNull();
    expect(edgeKey({ headers: { 'x-vercel-ip-country': 'ZA' } })).toBeNull();
    expect(
      edgeKey({ headers: { referer: 'https://www.google.com/' } })
    ).toBeNull();
  });

  it('produces a key that decodes to the expected seed', () => {
    expect(
      parseProfileVariantKey(
        edgeKey({
          headers: {
            referer: 'https://open.spotify.com/x',
            'x-vercel-ip-country': 'DE',
          },
        }) ?? ''
      )
    ).toEqual({ dsp: true, returning: false, country: 'DE' });
    expect(
      parseProfileVariantKey(
        edgeKey({ query: { utm_source: 'spotify' } }) ?? ''
      )
    ).toEqual({ dsp: true, returning: false, country: null });
    expect(
      parseProfileVariantKey(
        edgeKey({
          cookies: { jv_returning: '1' },
          headers: { 'x-vercel-ip-country': 'US' },
        }) ?? ''
      )
    ).toEqual({ dsp: false, returning: true, country: 'US' });
    expect(
      parseProfileVariantKey(edgeKey({ cookies: { jv_returning: '1' } }) ?? '')
    ).toEqual({ dsp: false, returning: true, country: null });
  });

  it('classifies DSP referrers exactly as the engine classifier does', () => {
    const referrers = [
      'https://open.spotify.com/artist/1',
      'https://spotify.link/abc',
      'https://music.apple.com/us/album/x',
      'https://music.youtube.com/watch',
      'https://www.deezer.com/en',
      'https://listen.tidal.com/',
      'https://music.amazon.co.uk/albums',
      'https://soundcloud.com/x',
      'https://artist.bandcamp.com/',
      'https://l.instagram.com/',
      'https://www.google.com/',
      'https://evilspotify.com.attacker.example/',
      'https://attacker.example/?r=spotify.com/',
    ];
    for (const referrer of referrers) {
      const engineSaysDsp =
        classifyVisitorSource({ referrer, search: '' }).channel === 'dsp';
      const key = edgeKey({ headers: { referer: referrer } });
      expect(key !== null && key.startsWith('d'), referrer).toBe(engineSaysDsp);
    }
  });

  it('bounds the variant space', () => {
    const keys = new Set<string>();
    for (const cc of [...rewrites.VARIANT_COUNTRIES, 'ZA'])
      for (const ref of [undefined, 'https://open.spotify.com/'])
        for (const ret of [undefined, '1']) {
          const k = edgeKey({
            headers: {
              'x-vercel-ip-country': cc,
              ...(ref ? { referer: ref } : {}),
            },
            cookies: ret ? { jv_returning: ret } : {},
          });
          if (k) keys.add(k);
        }
    expect(keys.size).toBeLessThanOrEqual(56);
  });
});
