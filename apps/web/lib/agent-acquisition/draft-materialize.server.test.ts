import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/cache/releases', () => ({ invalidateReleaseCaches: vi.fn() }));
vi.mock('@/lib/discography/queries', () => ({
  upsertRelease: vi.fn(),
  upsertProviderLink: vi.fn(),
}));

import { trustedImageUrl } from './draft-materialize.server';

describe('agent draft artwork allowlist', () => {
  it('keeps HTTPS artwork from DSP image CDNs', () => {
    for (const url of [
      'https://i.scdn.co/image/ab67616d0000b273',
      'https://image-cdn-ak.spotifycdn.com/image/x',
      'https://is1-ssl.mzstatic.com/image/thumb/x.jpg',
      'https://e-cdns-images.dzcdn.net/images/cover/x.jpg',
      'https://i1.sndcdn.com/artworks-x.jpg',
      'https://resources.tidal.com/images/x.jpg',
      'https://i.ytimg.com/vi/x/hqdefault.jpg',
      'https://f4.bcbits.com/img/a1_10.jpg',
    ]) {
      expect(trustedImageUrl(url)).toBe(url);
    }
  });

  it('drops user-upload hosts that the general CSP list allows', () => {
    for (const url of [
      'https://abc.supabase.co/storage/v1/object/public/x.png',
      'https://x.public.blob.vercel-storage.com/x.png',
      'https://lh3.googleusercontent.com/x',
      'https://cdn.discordapp.com/attachments/x.png',
      'https://api.qrserver.com/v1/create-qr-code/?data=x',
    ]) {
      expect(trustedImageUrl(url)).toBeNull();
    }
  });

  it('drops look-alike hosts, bare wildcard bases and unsafe URLs', () => {
    for (const url of [
      'https://i.scdn.co.evil.example/x.jpg',
      'https://evilmzstatic.com/x.jpg',
      'https://mzstatic.com/x.jpg',
      'http://i.scdn.co/image/x',
      `https://${['viewer', 'x'].join(':')}@i.scdn.co/image/x`,
      'https://i.scdn.co:8443/image/x',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
    ]) {
      expect(trustedImageUrl(url)).toBeNull();
    }
  });
});
