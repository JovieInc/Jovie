/**
 * A merch page follows its artist's profile indexing policy, so a reserved
 * or fixture handle (like the product crawl's hidden demo artist) stays out
 * of search. Executes the real generateMetadata with the merch loader mocked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CRAWL_CONTENT_FIXTURE } from '@/lib/synthetic/crawl-content-fixture';

const { getPublicMerchCardMock } = vi.hoisted(() => ({
  getPublicMerchCardMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));
vi.mock('@/lib/flags/profile-variant', () => ({
  getMerchMvpEnabled: async () => true,
}));
vi.mock('@/lib/merch/service', () => ({
  getPublicMerchCard: getPublicMerchCardMock,
  incrementMerchCardView: vi.fn(),
}));
vi.mock('@/app/[username]/merch/[cardId]/MerchCheckoutForm', () => ({
  MerchCheckoutForm: () => null,
}));

import { generateMetadata } from '@/app/[username]/merch/[cardId]/page';

const cardId = CRAWL_CONTENT_FIXTURE.merchCard.id;

function merchFor(username: string, displayName: string) {
  return {
    profile: { username, displayName },
    card: {
      title: 'Tee',
      productType: 'T-shirt',
      primaryImageUrl: '/images/demo/artwork-2.png',
    },
  };
}

describe('merch page robots', () => {
  beforeEach(() => getPublicMerchCardMock.mockReset());

  it('keeps the crawl fixture artist merch page out of search', async () => {
    const { handle, displayName } = CRAWL_CONTENT_FIXTURE;
    getPublicMerchCardMock.mockResolvedValue(merchFor(handle, displayName));
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: handle, cardId }),
    } as never);
    expect(metadata.robots).toMatchObject({ index: false });
  });

  it('noindexes a merch page that does not resolve', async () => {
    getPublicMerchCardMock.mockResolvedValue(null);
    const metadata = await generateMetadata({
      params: Promise.resolve({ username: 'nobody', cardId }),
    } as never);
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
