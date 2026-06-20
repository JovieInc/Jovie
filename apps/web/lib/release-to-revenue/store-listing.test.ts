import { describe, expect, it } from 'vitest';
import {
  mergeStoreListingMerchCardIds,
  normalizeStoreListing,
} from './store-listing';

describe('release-to-revenue store listing helpers', () => {
  it('deduplicates linked merch card ids', () => {
    expect(
      normalizeStoreListing({
        merchCardIds: ['card-a', 'card-a', 'card-b', ''],
      })
    ).toEqual({ merchCardIds: ['card-a', 'card-b'] });
  });

  it('merges explicit and discovered merch card ids without duplicates', () => {
    expect(
      mergeStoreListingMerchCardIds({ merchCardIds: ['card-a'] }, [
        'card-a',
        'card-b',
      ])
    ).toEqual({ merchCardIds: ['card-a', 'card-b'] });
  });
});
