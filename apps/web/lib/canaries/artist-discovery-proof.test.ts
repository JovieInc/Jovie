import { describe, expect, it } from 'vitest';
import {
  discoveryApiSchema,
  inspectDiscoveryGuide,
  inspectPublicItem,
  publicJsonLd,
} from './artist-discovery-proof';

const profileUrl = 'https://jov.ie/tim';
const item = {
  id: '1',
  title: 'Song',
  url: `${profileUrl}/song`,
  releaseDate: '2026-01-02',
};
const destination = 'https://music.apple.com/album/song';
const node = {
  '@type': 'MusicAlbum',
  url: item.url,
  name: item.title,
  datePublished: item.releaseDate,
  sameAs: [destination],
  potentialAction: [
    {
      '@type': 'ListenAction',
      name: 'Listen on Apple Music',
      target: { urlTemplate: destination },
    },
  ],
};
function documentFor(value: unknown, canonical = item.url) {
  return new DOMParser().parseFromString(
    `<link rel="canonical" href="${canonical}"><script type="application/ld+json">${JSON.stringify(value)}</script>`,
    'text/html'
  );
}
describe('creator discovery proof', () => {
  it('recovers named service destinations from raw HTML without JavaScript', () => {
    expect(
      inspectPublicItem(documentFor({ '@graph': [node] }), item, 'release')
    ).toMatchObject({
      passed: true,
      destinations: [{ label: 'Listen on Apple Music', url: destination }],
    });
    expect(publicJsonLd(documentFor([node, null, 'invalid']))).toHaveLength(1);
    expect(
      publicJsonLd(
        new DOMParser().parseFromString(
          '<script type="application/ld+json">invalid</script>',
          'text/html'
        )
      )
    ).toEqual([]);
  });
  it.each([
    { name: 'Wrong song' },
    { datePublished: '2020-01-02' },
    { potentialAction: [] },
    { url: `${profileUrl}/releases` },
    { sameAs: [destination, 'https://deezer.com/album/missing'] },
    {
      potentialAction: [
        {
          '@type': 'ListenAction',
          name: '',
          target: { urlTemplate: destination },
        },
      ],
    },
    {
      potentialAction: [
        {
          '@type': 'ListenAction',
          name: 'Bad',
          target: { urlTemplate: 'javascript:alert(1)' },
        },
      ],
    },
  ])('rejects a wrong or incomplete item despite HTTP success: %j', patch => {
    expect(
      inspectPublicItem(documentFor({ ...node, ...patch }), item, 'release')
        .passed
    ).toBe(false);
  });
  it('requires an exact release canonical and exact product SKU', () => {
    expect(
      inspectPublicItem(documentFor(node, profileUrl), item, 'release').passed
    ).toBe(false);
    const product = { ...node, '@type': 'Product', sku: item.id };
    expect(inspectPublicItem(documentFor(product), item, 'merch').passed).toBe(
      true
    );
    expect(
      inspectPublicItem(
        documentFor({ ...product, sku: 'other' }),
        item,
        'merch'
      ).passed
    ).toBe(false);
  });
  it('compares identity, claim status, exact guide links and release dates independently', () => {
    const api = discoveryApiSchema.parse({
      artist: {
        username: 'tim',
        name: 'Tim White',
        profileUrl,
        isClaimed: false,
        isVerified: false,
        links: [
          { url: 'https://example.com' },
          { url: 'https://example.com/work' },
        ],
      },
      releases: [item],
      merch: [],
    });
    const guide = `# Tim White\n- **Canonical URL**: ${profileUrl}\n- **Claim status**: Unclaimed\n- **Jovie verification**: Not verified\n- [Website](<https://example.com/>)\n- [Work](<https://example.com/work>)\n## Latest Release\n- **Title**: Song\n- **Released**: 2026-01-02\n- **Link**: ${item.url}\n`;
    const document = documentFor({ name: 'Tim White', url: profileUrl });
    const check = (text = guide) =>
      inspectDiscoveryGuide({
        document,
        guide: text,
        api,
        profileUrl,
        artistName: 'Tim White',
      });
    expect(check()).toEqual({
      identity: true,
      missingLinks: [],
      latestMatches: true,
    });
    expect(check(guide.replace('Unclaimed', 'Claimed')).identity).toBe(false);
    expect(
      check(guide.replace(item.url, `${profileUrl}/releases`)).latestMatches
    ).toBe(false);
    expect(check(guide.replace('2026-01-02', '2020-01-02')).latestMatches).toBe(
      false
    );
    expect(
      check(`${guide}- [Duplicate](<https://example.com/>)\n`).missingLinks
    ).toEqual(['https://example.com']);
    expect(
      check(guide.replace('- [Work](<https://example.com/work>)\n', ''))
        .missingLinks
    ).toEqual(['https://example.com/work']);
    expect(
      inspectDiscoveryGuide({
        document,
        guide: guide.split('## Latest Release')[0]!,
        api: { ...api, releases: [] },
        profileUrl,
        artistName: 'Tim White',
      }).latestMatches
    ).toBe(true);
    expect(discoveryApiSchema.safeParse({ artist: api.artist }).success).toBe(
      false
    );
  });
});
