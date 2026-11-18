import { expect, it } from 'vitest';
import { composePromotion, promotionContext } from './promotion-copy';

const now = new Date('2026-03-15T12:00:00Z');
const link = {
  provider: 'spotify',
  id: 'example',
  url: 'https://open.spotify.com/album/example',
};
it('includes an exact catalog destination only for released work with a matching provider ID', () => {
  const work = { status: 'released', releaseDate: new Date('2026-03-01') };
  const context = promotionContext(work, [link], now);
  expect(
    composePromotion('Window seat', 'The creator’s detail', context)
  ).toContain(link.url);
  expect(
    promotionContext(work, [{ ...link, id: 'different' }], now).destination
  ).toBeNull();
});
it('preserves creator copy for future and undated work without a listening claim', () => {
  for (const releaseDate of [new Date('2026-04-01'), null]) {
    const context = promotionContext(
      { status: 'released', releaseDate },
      [link],
      now
    );
    expect(context.phase).toBe(releaseDate ? 'upcoming' : 'unknown');
    expect(context.destination).toBeNull();
    expect(
      composePromotion('Window seat', 'The creator’s detail', context)
    ).toContain('The creator’s detail');
  }
});
